import { Request, Response, NextFunction } from 'express';
import prisma, { isDatabaseAvailable } from '../config/database';
import { AppError } from '../utils/errors';
import userService from '../services/userService';
import fs from 'fs';
import path from 'path';
import { UserType } from '@prisma/client';
import { notifyUser } from '../server';
import pushNotificationService from '../services/pushNotificationService';
import { calculateDistance, getBoundingBox } from '../utils/geo';
import { mockStorage, mockReviewStorage } from '../utils/mockStorage';

// Helper to serve mock electricians
function serveMockResponse(req: Request, res: Response, city: any, latNum: any, lngNum: any) {
    // Static mock electricians for fallback
    let mockElectricians: any[] = [
        {
            id: 'mock-elec-1',
            fullName: 'Ahmet Yılmaz',
            profileImageUrl: null,
            isVerified: true,
            electricianProfile: {
                specialties: ['Tesisat', 'Arıza'],
                ratingAverage: 4.8,
                totalReviews: 124,
                experienceYears: 20,
                isAvailable: true
            },
            locations: [{ city: 'İstanbul', district: 'Kadıköy', latitude: 40.9901, longitude: 29.0234, isDefault: true }]
        },
        {
            id: 'mock-elec-2',
            fullName: 'Mehmet Demir',
            profileImageUrl: null,
            isVerified: true,
            electricianProfile: {
                specialties: ['Aydınlatma'],
                ratingAverage: 4.5,
                totalReviews: 89,
                experienceYears: 12,
                isAvailable: true
            },
            locations: [{ city: 'İstanbul', district: 'Beşiktaş', latitude: 41.0422, longitude: 29.0083, isDefault: true }]
        },
        {
            id: 'mock-elec-adana-1',
            fullName: 'Mustafa Yıldız',
            profileImageUrl: null,
            isVerified: true,
            electricianProfile: {
                specialties: ['Tesisat', 'Klima Elektriği'],
                ratingAverage: 4.9,
                totalReviews: 42,
                experienceYears: 15,
                isAvailable: true
            },
            locations: [{ city: 'Adana', district: 'Seyhan', latitude: 36.9914, longitude: 35.3308, isDefault: true }]
        }
    ];


    // Include all registered electricians from mockStorage
    const allMockUsers = mockStorage.getAllUsers();
    console.log(`📋 Found ${allMockUsers.length} users in mockStorage`);

    for (const user of allMockUsers) {
        // Skip if already in static mocks or not an electrician
        if (user.id.startsWith('mock-elec-') || user.userType !== 'ELECTRICIAN') {
            continue;
        }

        console.log(`✅ Adding electrician from mockStorage: ${user.fullName} (${user.id})`);

        // Get raw data from mockStorage for location info
        const rawData = mockStorage.get(user.id);

        // Get specialties from electricianProfile if available
        const specialties = user.electricianProfile?.specialties || [];
        const experienceYears = user.electricianProfile?.experienceYears || 0;

        // Build locations from raw mockStorage data
        let userLocations = [{ city: 'Türkiye', district: 'Merkez', latitude: 41.0, longitude: 29.0, isDefault: true }];

        if (rawData.locations && rawData.locations.length > 0) {
            userLocations = rawData.locations.map((loc: any) => ({
                city: loc.city || 'Türkiye',
                district: loc.district || 'Merkez',
                latitude: loc.latitude || 41.0,
                longitude: loc.longitude || 29.0,
                isDefault: loc.isDefault ?? true
            }));
        } else if (rawData.city) {
            userLocations = [{
                city: rawData.city,
                district: rawData.district || 'Merkez',
                latitude: 41.0,
                longitude: 29.0,
                isDefault: true
            }];
        }

        mockElectricians.push({
            id: user.id,
            fullName: user.fullName || 'Elektrikçi',
            profileImageUrl: user.profileImageUrl || null,
            isVerified: user.isVerified || false,
            electricianProfile: {
                specialties: specialties.length > 0 ? specialties : ['Genel Elektrik'],
                // Get real rating stats from mockReviewStorage
                ratingAverage: mockReviewStorage.getRatingStats(user.id).ratingAverage || 0,
                totalReviews: mockReviewStorage.getRatingStats(user.id).totalReviews || 0,
                experienceYears: experienceYears,
                bio: rawData.bio || '',
                verificationStatus: user.isVerified ? 'VERIFIED' : 'PENDING',
                isAvailable: true
            },
            locations: userLocations
        });
    }

    // Filter mocks by city if requested
    if (city) {
        mockElectricians = mockElectricians.filter(e =>
            e.locations.some((l: any) => l.city.toLowerCase().includes(String(city).toLowerCase()) ||
                String(city).toLowerCase().includes(l.city.toLowerCase()))
        );
    }

    return res.status(200).json({
        success: true,
        data: mockElectricians
    });
}

// Multer-based upload (for FormData)
export const uploadAvatar = async (req: Request, res: Response, next: NextFunction) => {
    try {
        console.log('=== Upload Avatar Request ===');
        console.log('File:', req.file);
        console.log('User:', (req as any).user);

        if (!req.file) {
            console.log('No file uploaded');
            return next(new AppError('Please upload an image file', 400));
        }

        const userId = (req as any).user.id;
        const filePath = (req.file as any).path; // Cloudinary URL

        // Try database update, but don't fail if database is not available
        let updatedUser: any = null;
        try {
            updatedUser = await prisma.user.update({
                where: { id: userId },
                data: {
                    profileImageUrl: filePath,
                    updatedAt: new Date(),
                },
            });
        } catch (dbError: any) {
            console.warn('Database update failed, returning mock response:', dbError.message);
            // Return consistent mock user from storage
            updatedUser = mockStorage.getFullUser(userId, (req as any).user.userType);
        }

        res.status(200).json({
            success: true,
            data: updatedUser,
        });
    } catch (error) {
        console.error("=== Avatar upload error ===");
        console.error(error);
        next(error);
    }
};

// Base64-based upload (for React Native)
export const uploadAvatarBase64 = async (req: Request, res: Response, next: NextFunction) => {
    try {
        console.log('=== Upload Avatar Base64 Request ===');
        const { image } = req.body;
        const user = (req as any).user;

        console.log('User:', user);
        console.log('Image received:', image ? 'Yes (length: ' + image.length + ')' : 'No');

        if (!image) {
            return next(new AppError('Please provide an image', 400));
        }

        const userId = user.id;

        // Upload to Cloudinary
        const cloudinary = require('../config/cloudinary').default;
        const result = await cloudinary.uploader.upload(image, {
            folder: 'avatars',
            public_id: `avatar-${userId}-${Date.now()}`,
            resource_type: 'image'
        });

        const fileUrl = result.secure_url;

        // Persist in mock storage
        const mockData = mockStorage.updateProfile(userId, { profileImageUrl: fileUrl });

        // Try database update, but don't fail if database is not available
        let updatedUser: any = null;
        try {
            updatedUser = await prisma.user.update({
                where: { id: userId },
                data: {
                    profileImageUrl: fileUrl,
                    updatedAt: new Date(),
                },
                include: {
                    electricianProfile: true,
                },
            });
            console.log('Database updated');
        } catch (dbError: any) {
            // For mock users, extract userType from userId
            const userType = userId.endsWith('-ADMIN') ? 'ADMIN' :
                (userId.endsWith('-ELECTRICIAN') ? 'ELECTRICIAN' : 'CITIZEN');
            // Return consistent mock user with new profile image from storage
            updatedUser = mockStorage.getFullUser(userId, userType);
        }

        console.log('Returning user:', updatedUser);
        res.status(200).json({
            success: true,
            data: updatedUser,
            message: 'Profil fotoğrafı güncellendi',
        });
    } catch (error) {
        console.error("=== Avatar upload error ===");
        console.error(error);
        next(error);
    }
};

// Remove Avatar
export const removeAvatar = async (req: Request, res: Response, next: NextFunction) => {
    try {
        console.log('=== Remove Avatar Request ===');
        const user = (req as any).user;
        const userId = user.id;

        // Try database update
        let updatedUser: any = null;
        try {
            // Get current user to find existing avatar
            const currentUser = await prisma.user.findUnique({
                where: { id: userId },
                select: { profileImageUrl: true },
            });

            // Delete old avatar from Cloudinary if exists
            if (currentUser?.profileImageUrl) {
                const cloudinary = require('../config/cloudinary').default;
                try {
                    // Extract public_id from URL
                    // Example: https://res.cloudinary.com/cloudname/image/upload/v12345/avatars/filename.jpg
                    const parts = currentUser.profileImageUrl.split('/');
                    const filename = parts.pop();
                    const folder = parts.pop();
                    if (filename && folder === 'avatars') {
                        const publicId = `${folder}/${filename.split('.')[0]}`;
                        await cloudinary.uploader.destroy(publicId);
                        console.log('Deleted old avatar from Cloudinary:', publicId);
                    }
                } catch (err) {
                    console.error('Error deleting from Cloudinary:', err);
                }
            }

            // Update database
            updatedUser = await prisma.user.update({
                where: { id: userId },
                data: {
                    profileImageUrl: null,
                    updatedAt: new Date(),
                },
                include: {
                    electricianProfile: true,
                },
            });
            console.log('Database updated, avatar removed');
        } catch (dbError: any) {
            console.warn('Database update failed, using mock mode to remove avatar:', dbError.message);
            // Clear profileImageUrl in mockStorage - use empty string to trigger the !== undefined check
            const currentStore = mockStorage.get(userId);
            if (currentStore) {
                currentStore.profileImageUrl = undefined;
            }
            // Force save to disk
            const fs = require('fs');
            const path = require('path');
            const DATA_DIR = path.join(process.cwd(), 'data');
            const DATA_FILE = path.join(DATA_DIR, 'mock_users.json');
            try {
                const { getAllMockUsers } = require('../utils/mockStorage');
                fs.writeFileSync(DATA_FILE, JSON.stringify(getAllMockUsers(), null, 2), 'utf8');
                console.log('Mock storage saved to disk after avatar removal');
            } catch (saveError) {
                console.error('Failed to save mock storage:', saveError);
            }

            updatedUser = mockStorage.getFullUser(userId, user.userType);
            // Ensure profileImageUrl is null in response
            updatedUser.profileImageUrl = null;
            console.log('Mock storage updated, avatar removed for user:', userId);
        }

        res.status(200).json({
            success: true,
            data: updatedUser,
        });
    } catch (error) {
        console.error("=== Avatar remove error ===");
        console.error(error);
        next(error);
    }
};
export const getElectricianStats = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = (req as any).user.id;
        const userType = (req as any).user.userType;

        // İstatistikleri gerçek veritabanından çekmeyi dene
        try {
            // Temel istatistikler
            const [
                totalBids,
                activeBids,
                acceptedBids,
                electricianProfile,
            ] = await Promise.all([
                prisma.bid.count({ where: { electricianId: userId } }),
                prisma.bid.count({ where: { electricianId: userId, status: 'PENDING' } }),
                prisma.bid.findMany({
                    where: { electricianId: userId, status: 'ACCEPTED' },
                    include: {
                        jobPost: {
                            select: {
                                status: true,
                                category: true,
                                completedAt: true,
                            },
                        },
                    },
                }),
                prisma.electricianProfile.findUnique({
                    where: { userId },
                    select: {
                        ratingAverage: true,
                        totalReviews: true,
                        completedJobsCount: true,
                    },
                }),
            ]);

            // Tamamlanan işler
            const completedJobs = acceptedBids.filter(
                (bid) => bid.jobPost.status === 'COMPLETED'
            );

            // Aktif işler
            const activeJobs = acceptedBids.filter(
                (bid) => bid.jobPost.status === 'IN_PROGRESS'
            );

            // Toplam kazanç
            const totalEarnings = completedJobs.reduce(
                (sum, bid) => sum + Number(bid.amount),
                0
            );

            // Kategori dağılımı
            const categoryMap = new Map<string, number>();
            completedJobs.forEach((bid) => {
                const category = bid.jobPost.category || 'Diğer';
                categoryMap.set(category, (categoryMap.get(category) || 0) + 1);
            });
            const categoryDistribution = Array.from(categoryMap.entries())
                .map(([category, count]) => ({ category, count }))
                .sort((a, b) => b.count - a.count)
                .slice(0, 5);

            // Son 7 gün için günlük kazanç
            const weeklyEarnings = [];
            const dayNames = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
            const today = new Date();
            for (let i = 6; i >= 0; i--) {
                const date = new Date(today);
                date.setDate(date.getDate() - i);
                const dayStart = new Date(date.setHours(0, 0, 0, 0));
                const dayEnd = new Date(date.setHours(23, 59, 59, 999));

                const dayJobs = completedJobs.filter((bid) => {
                    const completedAt = bid.jobPost.completedAt;
                    if (!completedAt) return false;
                    return completedAt >= dayStart && completedAt <= dayEnd;
                });

                const amount = dayJobs.reduce((sum, bid) => sum + Number(bid.amount), 0);
                weeklyEarnings.push({
                    day: dayNames[dayStart.getDay()],
                    amount,
                });
            }

            const stats = {
                totalBids,
                activeBids,
                activeJobs: activeJobs.length,
                completedJobs: completedJobs.length,
                totalEarnings,
                rating: electricianProfile?.ratingAverage ? Number(electricianProfile.ratingAverage) : 0,
                reviewCount: electricianProfile?.totalReviews || 0,
                weeklyEarnings,
                categoryDistribution,
            };

            return res.status(200).json({
                success: true,
                data: stats,
            });
        } catch (dbError: any) {
            console.warn('Database query failed, returning mock stats:', dbError.message);
            // Database bağlantı hatası - mock veriler döndür
        }

        // Get dynamic mock data
        // userId is already defined at top of function
        const reviewStats = mockReviewStorage.getRatingStats(userId);
        const userData: any = mockStorage.get(userId);
        const completedJobs = userData?.completedJobsCount || 0;

        // Mock stats (database bağlantısı yoksa) - Use dynamic values where possible
        // Calculate dynamic stats from userBidsStore
        let totalBids = 0;
        let activeBids = 0;
        let activeJobs = 0;
        let totalEarnings = 0;

        // Default chart data
        let weeklyEarnings = [
            { day: 'Pzt', amount: 0 },
            { day: 'Sal', amount: 0 },
            { day: 'Çar', amount: 0 },
            { day: 'Per', amount: 0 },
            { day: 'Cum', amount: 0 },
            { day: 'Cmt', amount: 0 },
            { day: 'Paz', amount: 0 },
        ];
        let categoryMap: Record<string, number> = {};

        try {
            const { userBidsStore } = require('./bidController');
            if (userBidsStore && userBidsStore.has(userId)) {
                const bids = userBidsStore.get(userId) || [];
                totalBids = bids.length;
                activeBids = bids.filter((b: any) => b.status === 'PENDING' || b.status === 'OFFERED').length;
                activeJobs = bids.filter((b: any) => b.status === 'ACCEPTED' && b.jobPost?.status !== 'COMPLETED').length;

                // Process completed jobs for Earnings and Distribution
                bids.forEach((b: any) => {
                    const isCompleted = b.status === 'COMPLETED' || b.jobPost?.status === 'COMPLETED';
                    if (isCompleted) {
                        const amount = Number(b.amount) || 0;
                        totalEarnings += amount;

                        // Weekly Earnings
                        // Use updated date of bid or completed date of job
                        const dateStr = b.jobPost?.completedAt || b.updatedAt || new Date().toISOString();
                        const date = new Date(dateStr);
                        const dayIndex = date.getDay(); // 0(Sun) - 6(Sat)

                        // Map Sun(0)->6, Mon(1)->0...
                        const arrayIndex = dayIndex === 0 ? 6 : dayIndex - 1;
                        if (weeklyEarnings[arrayIndex]) {
                            weeklyEarnings[arrayIndex].amount += amount;
                        }

                        // Category Distribution
                        let category = b.jobPost?.categoryId || 'Diğer';
                        // Infer category from title if missing
                        if ((!category || category === 'Diğer') && b.jobPost?.title) {
                            const title = b.jobPost.title.toLowerCase();
                            if (title.includes('tesisat')) category = 'Tesisat';
                            else if (title.includes('montaj')) category = 'Montaj';
                            else if (title.includes('tamir') || title.includes('onarım')) category = 'Arıza Onarım';
                            else if (title.includes('aydınlatma')) category = 'Aydınlatma';
                            else if (title.includes('kamera') || title.includes('güvenlik')) category = 'Güvenlik';
                            else if (title.includes('priz') || title.includes('anahtar')) category = 'Priz/Anahtar';
                        }
                        categoryMap[category] = (categoryMap[category] || 0) + 1;
                    }
                });
            }
        } catch (e) { console.error('Stats Calc Error:', e); }

        const categoryDistribution = Object.keys(categoryMap).length > 0
            ? Object.keys(categoryMap).map(key => ({ category: key, count: categoryMap[key] }))
            : [
                { category: 'Arıza Onarım', count: 0 },
                { category: 'Tesisat', count: 0 },
                { category: 'Aydınlatma', count: 0 },
                { category: 'Priz/Anahtar', count: 0 },
                { category: 'Diğer', count: 0 },
            ];

        const mockStats = {
            totalBids: totalBids,
            activeBids: activeBids,
            activeJobs: activeJobs,
            completedJobs: completedJobs,
            totalEarnings: totalEarnings,
            rating: reviewStats.ratingAverage || 0,
            reviewCount: reviewStats.totalReviews || 0,
            weeklyEarnings,
            categoryDistribution,
        };

        res.status(200).json({
            success: true,
            data: mockStats,
        });
    } catch (error) {
        next(error);
    }
};

// Change Password
export const changePassword = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = (req as any).user.id;
        const { currentPassword, newPassword } = req.body;

        // Validation
        if (!currentPassword || !newPassword) {
            return res.status(400).json({
                success: false,
                error: { message: 'Mevcut şifre ve yeni şifre gereklidir' },
            });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({
                success: false,
                error: { message: 'Yeni şifre en az 6 karakter olmalıdır' },
            });
        }

        try {
            await userService.changePassword(userId, currentPassword, newPassword);

            res.status(200).json({
                success: true,
                message: 'Şifre başarıyla güncellendi',
            });
        } catch (dbError: any) {
            console.warn('changePassword error:', dbError.message || dbError);

            // AppError (kullanıcı hatası) ise fırlat
            if (dbError.statusCode) {
                throw dbError;
            }

            // Database bağlantı hatası - mock mode'da şifre kontrolü yap
            console.warn('Database not connected, checking password in mock mode');

            const bcrypt = require('bcryptjs'); // Tutarlılık için bcryptjs kullan
            const { mockStorage } = require('../utils/mockStorage');
            const mockUser = mockStorage.get(userId);

            // Debug log
            console.log('🔍 Mock Password Change Debug:', {
                userId,
                hasPasswordHash: !!mockUser.passwordHash,
                passwordHashType: typeof mockUser.passwordHash,
                passwordHashLength: mockUser.passwordHash?.length
            });

            if (!mockUser) {
                return res.status(404).json({
                    success: false,
                    error: { message: 'Kullanıcı bulunamadı' },
                });
            }

            // Check if password hash exists
            if (!mockUser.passwordHash) {
                return res.status(400).json({
                    success: false,
                    error: { message: 'Hesap şifresi tanımlı değil. Lütfen yeniden kayıt olun.' },
                });
            }

            // Verify current password
            let isPasswordValid = false;
            if (mockUser.passwordHash) {
                // Try direct comparison first (for simple passwords)
                isPasswordValid = mockUser.passwordHash === currentPassword;

                // If failed, try bcrypt comparison
                if (!isPasswordValid) {
                    try {
                        isPasswordValid = await bcrypt.compare(currentPassword, mockUser.passwordHash);
                    } catch (e) {
                        // Hash format invalid, already checked equality above
                    }
                }
            }

            if (!isPasswordValid) {
                return res.status(400).json({
                    success: false,
                    error: { message: 'Mevcut şifre yanlış' },
                });
            }

            // Hash new password and save
            // IMPORTANT: Also reactivate account if it was marked as deleted
            // User changing password = account should be active
            const newPasswordHash = await bcrypt.hash(newPassword, 10);
            mockStorage.updateProfile(userId, {
                passwordHash: newPasswordHash,
                isActive: true // Reactivate account on password change
            });

            res.status(200).json({
                success: true,
                message: 'Şifre başarıyla güncellendi',
            });
        }
    } catch (error: any) {
        if (error.statusCode) {
            return res.status(error.statusCode).json({
                success: false,
                error: { message: error.message },
            });
        }
        next(error);
    }
};


// Update Profile
export const updateProfile = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = (req as any).user.id;
        const { fullName, phone, email, specialties, experienceYears } = req.body;

        try {
            const updatedUser = await userService.updateProfile(userId, {
                fullName,
                phone,
                email,
                specialties,
                experienceYears
            });

            // Refresh socket rooms (in case city/location changed)
            const { refreshUserRooms } = require('../services/socketHandler');
            refreshUserRooms(userId);

            res.status(200).json({
                success: true,
                data: { user: updatedUser },
                message: 'Profil güncellendi',
            });
        } catch (dbError: any) {
            // Database bağlantısı yoksa mock başarı döndür
            console.warn('Database error, simulating profile update:', dbError.message);

            const user = (req as any).user;
            const currentMock = mockStorage.get(userId);
            const isElectrician = user.userType === 'ELECTRICIAN';

            // Mock Bonus Logic: If electrician and entering phone for first time
            // Or if they have a phone but were not verified yet
            const isAlreadyVerified = currentMock.isVerified || (user as any).isVerified;
            const willVerify = isElectrician && phone && !isAlreadyVerified;

            // First time phone entry bonus for electricians
            if (willVerify) {
                mockStorage.addCredits(userId, 5);
            }

            // Save to mock storage for session persistence
            const mockData = mockStorage.updateProfile(userId, {
                experienceYears: (experienceYears !== undefined && experienceYears !== null) ? Number(experienceYears) : undefined,
                specialties,
                fullName,
                phone,
                email,
                isVerified: (willVerify || isAlreadyVerified) ? true : false
            });

            // Refresh socket rooms (Mock mode city change)
            const { refreshUserRooms } = require('../services/socketHandler');
            refreshUserRooms(userId);

            res.status(200).json({
                success: true,
                data: {
                    user: mockStorage.getFullUser(userId, user.userType)
                },
                message: 'Profil güncellendi (test modu)',
            });
        }
    } catch (error: any) {
        if (error.statusCode) {
            return res.status(error.statusCode).json({
                success: false,
                error: { message: error.message },
            });
        }
        next(error);
    }
};

// Get Verification Status
export const getVerificationStatus = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const user = (req as any).user;
        const userId = user.id;

        // Only electricians can have verification
        if (user.userType !== 'ELECTRICIAN') {
            return res.status(403).json({
                success: false,
                error: { message: 'Sadece elektrikçiler belge onayı yapabilir' },
            });
        }

        try {
            if (!isDatabaseAvailable) {
                // Skip Prisma if DB is not available to avoid error logs
                throw new Error('Database not connected');
            }

            const profile = await prisma.electricianProfile.findUnique({
                where: { userId },
                select: {
                    verificationStatus: true,
                    verificationDocuments: true,
                    licenseNumber: true,
                    licenseVerified: true,
                },
            });

            if (!profile) {
                return res.json({
                    success: true,
                    data: { status: null },
                });
            }

            const documents = profile.verificationDocuments as any;

            res.json({
                success: true,
                data: {
                    status: profile.verificationStatus,
                    licenseNumber: profile.licenseNumber,
                    licenseVerified: profile.licenseVerified,
                    documentType: documents?.documentType || null,
                    documentUrl: documents?.documentUrl || null,
                    submittedAt: documents?.submittedAt || null,
                    reviewedAt: documents?.reviewedAt || null,
                    rejectionReason: documents?.rejectionReason || null,
                },
            });
        } catch (dbError: any) {
            const isConnectionError =
                dbError.message?.includes('connect') ||
                dbError.message?.includes('database') ||
                dbError.message?.includes("Can't reach database") ||
                dbError.code === 'P1001';

            if (isConnectionError) {
                console.warn('⚠️ Database not connected, returning mock verification status');
            } else {
                console.warn('Database error, returning mock verification status:', dbError.message);
            }
            // Mock response for testing
            const mockData = mockStorage.get(userId);
            res.json({
                success: true,
                data: {
                    status: mockData.verificationStatus || null,
                    documentType: mockData.documentType || null,
                    submittedAt: mockData.submittedAt || null,
                    licenseNumber: mockData.phone ? 'TEST-LICENSE' : null
                },
            });
        }
    } catch (error) {
        next(error);
    }
};

// Submit Verification Documents
export const submitVerification = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const user = (req as any).user;
        const userId = user.id;
        const { documentType, licenseNumber, documentImage } = req.body;

        // Only electricians can submit verification
        if (user.userType !== 'ELECTRICIAN') {
            return res.status(403).json({
                success: false,
                error: { message: 'Sadece elektrikçiler belge onayı yapabilir' },
            });
        }

        // Validation
        if (!documentType || !licenseNumber) {
            return res.status(400).json({
                success: false,
                error: { message: 'Belge türü ve lisans numarası gereklidir' },
            });
        }

        let documentUrl = null;
        try {
            // Save document image if provided
            if (documentImage) {
                // Extract base64 data
                let base64Data: string;
                let ext = 'jpg';

                if (documentImage.startsWith('data:')) {
                    const matches = documentImage.match(/^data:image\/([a-zA-Z]+);base64,(.+)$/);
                    if (matches) {
                        ext = matches[1];
                        base64Data = matches[2];
                    } else {
                        base64Data = documentImage;
                    }
                } else {
                    base64Data = documentImage;
                }

                const buffer = Buffer.from(base64Data, 'base64');

                // Create uploads directory
                const uploadDir = path.join(process.cwd(), 'uploads', 'verifications');
                if (!fs.existsSync(uploadDir)) {
                    fs.mkdirSync(uploadDir, { recursive: true });
                }

                // Generate unique filename
                const filename = `verification-${userId}-${Date.now()}.${ext}`;
                const filePath = path.join(uploadDir, filename);

                // Write file
                fs.writeFileSync(filePath, buffer);
                documentUrl = `/uploads/verifications/${filename}`;
            }

            // Update electrician profile
            const updatedProfile = await prisma.electricianProfile.update({
                where: { userId },
                data: {
                    licenseNumber: licenseNumber,
                    verificationStatus: 'PENDING',
                    verificationDocuments: {
                        documentType,
                        documentUrl,
                        submittedAt: new Date().toISOString(),
                    },
                },
            });

            res.json({
                success: true,
                data: {
                    status: 'PENDING',
                    message: 'Belgeniz onay için gönderildi',
                },
            });
        } catch (dbError: any) {
            console.warn('Database error, simulating verification submit:', dbError.message);
            // Persistence in mock storage
            mockStorage.updateProfile(userId, {
                verificationStatus: 'PENDING',
                documentType,
                submittedAt: new Date().toISOString(),
                documentUrl
            });

            // Mock success for testing
            res.json({
                success: true,
                data: {
                    status: 'PENDING',
                    message: 'Belgeniz onay için gönderildi (test modu)',
                },
            });
        }
    } catch (error) {
        next(error);
    }
};
// Update Push Token
export const updatePushToken = async (req: Request, res: Response, next: NextFunction) => {
    try {
        // Kullanıcı giriş yapmamışsa (misafir), sessizce başarılı dön
        if (!(req as any).user || !(req as any).user.id) {
            return res.status(200).json({
                success: true,
                message: 'Push token skipped (not authenticated)',
            });
        }

        const userId = (req as any).user.id;
        const { pushToken } = req.body;

        if (!pushToken) {
            return res.status(400).json({
                success: false,
                error: { message: 'Push token is required' },
            });
        }

        console.log(`\n🔔 PUSH TOKEN RECEIVED for user ${userId}:`);
        console.log(`   Token: ${pushToken}\n`);

        try {
            await prisma.user.update({
                where: { id: userId },
                data: { pushToken },
            });

            res.status(200).json({
                success: true,
                message: 'Push token updated successfully',
            });
        } catch (dbError: any) {
            console.warn('Database error updating push token, saving to mockStorage:', dbError.message);

            // Save to mock storage so push notifications work in mock mode
            const { mockStorage } = require('../utils/mockStorage');
            mockStorage.updateProfile(userId, { pushToken } as any);
            console.log(`✅ PushToken saved to mockStorage for user ${userId}`);

            res.status(200).json({
                success: true,
                message: 'Push token updated (test mode)',
            });
        }
    } catch (error) {
        next(error);
    }
};

/**
 * Get Electricians for Map/List with filters
 */
export const getElectricians = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { city, specialty, query, lat, lng, radius } = req.query;

        console.log(`🔍 Fetching electricians with filters: city=${city}, specialty=${specialty}, query=${query}, lat=${lat}, lng=${lng}, radius=${radius}`);

        const latNum = lat ? parseFloat(lat as string) : undefined;
        const lngNum = lng ? parseFloat(lng as string) : undefined;
        const radiusNum = radius ? parseFloat(radius as string) : 10; // Default 10km

        let locationFilter: any = undefined;

        if (latNum && lngNum) {
            const bbox = getBoundingBox(latNum, lngNum, radiusNum);
            locationFilter = {
                some: {
                    latitude: { gte: bbox.minLat, lte: bbox.maxLat },
                    longitude: { gte: bbox.minLon, lte: bbox.maxLon }
                }
            };
        } else if (city) {
            locationFilter = { some: { city: String(city) } };
        }

        if (!isDatabaseAvailable) {
            // Serve mock data
            return serveMockResponse(req, res, city, latNum, lngNum);
        }

        let results;
        try {
            results = await prisma.user.findMany({
                where: {
                    userType: 'ELECTRICIAN',
                    fullName: query ? { contains: String(query), mode: 'insensitive' } : undefined,
                    electricianProfile: {
                        specialties: specialty ? { has: String(specialty) } : undefined
                    },
                    locations: locationFilter
                },
                select: {
                    id: true,
                    fullName: true,
                    profileImageUrl: true,
                    isVerified: true,
                    electricianProfile: {
                        select: {
                            specialties: true,
                            ratingAverage: true,
                            totalReviews: true,
                            experienceYears: true,
                            bio: true,
                            verificationStatus: true,
                            isAvailable: true
                        }
                    },
                    locations: {
                        select: {
                            id: true,
                            city: true,
                            district: true,
                            latitude: true,
                            longitude: true,
                            isDefault: true
                        }
                    },
                    reviewsReceived: {
                        take: 1,
                        orderBy: { createdAt: 'desc' },
                        select: {
                            comment: true,
                            reviewer: {
                                select: {
                                    fullName: true
                                }
                            }
                        }
                    }
                }
            });
        } catch (dbError: any) {
            console.warn('Database error in getElectricians, falling back to mock:', dbError.message);
            return serveMockResponse(req, res, city, latNum, lngNum);
        }

        // Add distance calculation if coordinates were provided
        if (latNum && lngNum) {
            results = (results as any[]).map(elec => {
                const loc = elec.locations.find((l: any) => l.isDefault) || elec.locations[0];
                let distance = null;
                if (loc) {
                    distance = calculateDistance(latNum, lngNum, Number(loc.latitude), Number(loc.longitude));
                }
                return { ...elec, distance: distance ? parseFloat(distance.toFixed(2)) : null };
            });

            // Filter by exact radius after bbox optimization
            results = results.filter((elec: any) => elec.distance === null || elec.distance <= radiusNum);

            // Sort by distance
            results.sort((a: any, b: any) => (a.distance || 999) - (b.distance || 999));
        }

        // Veritabanı boşsa veya hiç usta yoksa, kullanıcıya boş bir ekran göstermemek için 
        // mock verilerle destekle (Geliştirme/Test aşaması için)
        if (results.length === 0 && !query && !city && !specialty) {
            results = [
                {
                    id: 'mock-elec-1',
                    fullName: 'Ahmet Yılmaz (Onaylı)',
                    profileImageUrl: null,
                    isVerified: true,
                    electricianProfile: {
                        specialties: ['Tesisat', 'Arıza'],
                        ratingAverage: 4.8,
                        totalReviews: 124,
                        experienceYears: 12,
                        bio: '12 yıllık deneyimli usta.',
                        verificationStatus: 'VERIFIED',
                        isAvailable: true
                    },
                    locations: [{ city: 'İstanbul', district: 'Kadıköy', latitude: 40.9901, longitude: 29.0234, isDefault: true }]
                },
                {
                    id: 'mock-elec-2',
                    fullName: 'Mehmet Demir (Onaylı)',
                    profileImageUrl: null,
                    isVerified: true,
                    electricianProfile: {
                        specialties: ['Aydınlatma', 'Avize'],
                        ratingAverage: 4.9,
                        totalReviews: 89,
                        experienceYears: 8,
                        bio: 'Aydınlatma uzmanı.',
                        verificationStatus: 'VERIFIED',
                        isAvailable: true
                    },
                    locations: [{ city: 'İstanbul', district: 'Beşiktaş', latitude: 41.0422, longitude: 29.0083, isDefault: true }]
                }
            ] as any;
        }

        res.status(200).json({
            success: true,
            data: results
        });
    } catch (error) {
        console.error('Error in getElectricians:', error);
        next(error);
    }
};

/**
 * Get Specific Electrician Profile by ID
 */
export const getElectricianById = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;

        // 1. Try real database first if available
        if (isDatabaseAvailable) {
            try {
                const electrician = await prisma.user.findUnique({
                    where: {
                        id: id,
                        userType: 'ELECTRICIAN'
                    },
                    select: {
                        id: true,
                        fullName: true,
                        profileImageUrl: true,
                        isVerified: true,
                        electricianProfile: {
                            select: {
                                specialties: true,
                                ratingAverage: true,
                                totalReviews: true,
                                experienceYears: true,
                                bio: true,
                                verificationStatus: true,
                                completedJobsCount: true,
                                responseTimeAvg: true,
                                serviceCategory: true
                            }
                        },
                        locations: {
                            where: { isDefault: true },
                            select: {
                                city: true,
                                district: true
                            }
                        },
                        reviewsReceived: {
                            take: 5,
                            orderBy: { createdAt: 'desc' },
                            include: {
                                reviewer: {
                                    select: {
                                        fullName: true,
                                        profileImageUrl: true
                                    }
                                }
                            }
                        }
                    }
                });

                if (electrician) {
                    return res.status(200).json({
                        success: true,
                        data: electrician
                    });
                }
            } catch (dbError: any) {
                const dbMsg = dbError.message || '';
                const isConnectionError =
                    dbError.code?.startsWith('P1') ||
                    dbMsg.includes('connect') ||
                    dbMsg.includes('database') ||
                    dbMsg.includes('reach') ||
                    dbMsg.includes('timeout') ||
                    dbError.name?.includes('Prisma') ||
                    dbError.name === 'PrismaClientInitializationError';

                if (!isConnectionError && !id.startsWith('mock-')) {
                    // It's a real DB error (not connection) for a real ID, rethrow
                    throw dbError;
                }
                console.warn('⚠️ Database fetch failed in getElectricianById, falling back to mock storage');
            }
        }

        // 2. Fallback to mock storage (for mock IDs or when DB is down)
        // Check if this is a known mock user from our session storage
        const mockData = mockStorage.get(id);
        const isKnownMockUser = !!mockData.fullName || mockData.specialties.length > 0;

        // Build locations from mockStorage data
        let userLocations = [{ city: 'İstanbul', district: 'Merkez', isDefault: true }];

        if (mockData.locations && mockData.locations.length > 0) {
            userLocations = mockData.locations.map((loc: any) => ({
                city: loc.city || 'Türkiye',
                district: loc.district || 'Merkez',
                isDefault: loc.isDefault ?? true
            }));
        } else if (mockData.city) {
            userLocations = [{
                city: mockData.city,
                district: mockData.district || 'Merkez',
                isDefault: true
            }];
        }

        // Get city from first location
        const primaryCity = userLocations[0]?.city || 'Türkiye';

        // Get real rating stats from mock reviews
        const reviewStats = mockReviewStorage.getRatingStats(id);
        const mockReviews = mockReviewStorage.getReviewsForElectrician(id).slice(0, 5);

        // Mock data fallback or dynamic mock data
        return res.status(200).json({
            success: true,
            data: {
                id: id,
                fullName: mockData.fullName || 'Ahmet Yılmaz',
                profileImageUrl: mockData.profileImageUrl || null,
                phone: mockData.phone || null,
                city: primaryCity,
                isVerified: mockData.isVerified ?? true,
                electricianProfile: {
                    specialties: mockData.specialties.length > 0 ? mockData.specialties : ['Tesisat', 'Arıza', 'Aydınlatma', 'Pano'],
                    ratingAverage: reviewStats.ratingAverage || (isKnownMockUser ? 0 : 4.8),
                    totalReviews: reviewStats.totalReviews || (isKnownMockUser ? 0 : 124),
                    experienceYears: mockData.experienceYears || (isKnownMockUser ? 0 : 12),
                    bio: mockData.bio || null,
                    verificationStatus: (mockData.isVerified ?? true) ? 'APPROVED' : 'PENDING',
                    completedJobsCount: mockData.completedJobsCount || 0,
                    responseTimeAvg: 2,
                    serviceCategory: mockData.serviceCategory || (mockData.specialties.some((s: string) => s.toLowerCase().includes('klima')) ? 'klima' : 'elektrik')
                },
                locations: userLocations,
                reviewsReceived: mockReviews.map(r => {
                    // Get current reviewer info from mockStorage (for dynamic updates)
                    const reviewerData = mockStorage.get(r.reviewerId);
                    // Check if this is a known user in mockStorage (has fullName set)
                    const isKnownUser = reviewerData && reviewerData.fullName && reviewerData.fullName !== 'Test Kullanıcısı';

                    return {
                        id: r.id,
                        rating: r.rating,
                        comment: r.comment,
                        createdAt: r.createdAt,
                        reviewer: {
                            // If user exists in mockStorage, use their current data (even if null)
                            fullName: isKnownUser ? reviewerData.fullName : (r.reviewerName || 'Müşteri'),
                            profileImageUrl: isKnownUser ? (reviewerData.profileImageUrl || null) : (r.reviewerImageUrl || null)
                        }
                    };
                })
            }
        });
    } catch (error) {
        console.error('Error in getElectricianById:', error);
        next(error);
    }
};

// --- ADMIN FUNCTIONS ---



// Delete Account
export const deleteAccount = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = (req as any).user.id;

        try {
            await userService.deleteAccount(userId);

            res.status(200).json({
                success: true,
                message: 'Hesabınız başarıyla silindi (askıya alındı).',
            });
        } catch (dbError: any) {
            console.warn('deleteAccount error:', dbError.message || dbError);

            // Database bağlantı hatası - mock başarı döndür (ve isActive=false yap)
            console.warn('Database not connected, deactivating account in mock mode');

            const { mockStorage } = require('../utils/mockStorage');
            // Mock veride isActive=false olarak işaretle
            mockStorage.updateProfile(userId, { isActive: false });

            res.status(200).json({
                success: true,
                message: 'Hesabınız başarıyla silindi (test modu).',
            });
        }
    } catch (error: any) {
        next(error);
    }
};


