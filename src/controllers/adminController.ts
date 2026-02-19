import { Request, Response, NextFunction } from 'express';
import prisma, { isDatabaseAvailable } from '../config/database';
import { mockStorage } from '../utils/mockStorage';
import { notifyUser } from '../server';
import pushNotificationService from '../services/pushNotificationService';
import { jobStoreById, deleteMockJob, getMockJobs, loadMockJobs } from './jobController';
import { mockTransactionStorage } from '../utils/mockStorage';

/**
 * Get all pending verifications
 * Admin ONLY
 */
export const getAllVerifications = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const user = (req as any).user;

        // Extra check just in case, though middleware handles it
        if (user.userType !== 'ADMIN') {
            return res.status(403).json({
                success: false,
                error: { message: 'Bu işlem için admin yetkisi gereklidir' },
            });
        }

        // FAST PATH: Mock results for testing if DB is down
        if (!isDatabaseAvailable || user.id.startsWith('mock-')) {
            const allUsers = mockStorage.getAllUsers();
            const pendingMocks = allUsers
                .filter(u => u.userType === 'ELECTRICIAN' && u.verificationStatus === 'PENDING')
                .map(u => ({
                    userId: u.id,
                    verificationStatus: 'PENDING',
                    verificationDocuments: u.electricianProfile?.verificationDocuments,
                    serviceCategory: u.electricianProfile?.serviceCategory,
                    user: {
                        id: u.id,
                        fullName: u.fullName,
                        email: u.email,
                        phone: u.phone
                    }
                }));

            // If no real pending mocks, AND the sample user is not already processed/verified in mockStorage
            if (pendingMocks.length === 0) {
                const sampleMockUser = mockStorage.get('mock-electrician-1');
                // Only add if it doesn't exist (fresh start) or if it exists and is explicitly PENDING
                const shouldAddSample = !sampleMockUser || (sampleMockUser.verificationStatus === 'PENDING');

                if (shouldAddSample) {
                    pendingMocks.push({
                        userId: 'mock-electrician-1',
                        verificationStatus: 'PENDING',
                        verificationDocuments: {
                            documentType: 'ELEKTRIK_USTASI',
                            documentUrl: undefined,
                            submittedAt: new Date().toISOString(),
                        },
                        serviceCategory: 'elektrik',
                        user: {
                            id: 'mock-electrician-1',
                            fullName: 'Ahmet Yılmaz (Örnek)',
                            email: 'ahmet@test.com',
                            phone: '5551234455'
                        }
                    });
                }
            }

            return res.json({
                success: true,
                data: pendingMocks
            });
        }

        try {
            const pendingProfiles = await prisma.electricianProfile.findMany({
                where: {
                    verificationStatus: 'PENDING',
                },
                include: {
                    user: {
                        select: {
                            id: true,
                            fullName: true,
                            email: true,
                            phone: true,
                        }
                    }
                },
                orderBy: {
                    updatedAt: 'desc'
                }
            });

            res.json({
                success: true,
                data: pendingProfiles,
            });
        } catch (dbErr: any) {
            console.error('Database error in getAllVerifications:', dbErr.message);
            // Fallback to same mock data if query fails
            res.json({
                success: true,
                data: [
                    {
                        userId: 'mock-electrician-1',
                        verificationStatus: 'PENDING',
                        verificationDocuments: {
                            documentType: 'ELEKTRIK_USTASI',
                            documentUrl: undefined,
                            submittedAt: new Date().toISOString(),
                        },
                        serviceCategory: 'elektrik',
                        user: {
                            id: 'mock-electrician-1',
                            fullName: 'Ahmet Yılmaz (Mock - Fallback)',
                            email: 'ahmet@test.com',
                            phone: '5551234455'
                        }
                    }
                ]
            });
        }
    } catch (error) {
        console.error('Error in getAllVerifications:', error);
        next(error);
    }
};

/**
 * Process a verification request (Approve or Reject)
 * Admin ONLY
 */
export const processVerification = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const adminUser = (req as any).user;
        const { targetUserId, status, reason } = req.body;

        if (adminUser.userType !== 'ADMIN') {
            return res.status(403).json({
                success: false,
                error: { message: 'Bu işlem için admin yetkisi gereklidir' },
            });
        }

        if (!['VERIFIED', 'REJECTED'].includes(status)) {
            return res.status(400).json({
                success: false,
                error: { message: 'Geçersiz durum. VERIFIED veya REJECTED olmalı.' },
            });
        }

        // FAST PATH: Mock processing for test users
        if (!isDatabaseAvailable || adminUser.id.startsWith('mock-')) {
            console.warn('⚠️ processVerification: DB down, updating mockStorage');

            mockStorage.updateProfile(targetUserId, {
                verificationStatus: status,
                isVerified: status === 'VERIFIED'
            });

            // Award 5 bonus credits for first-time verification as promised
            if (status === 'VERIFIED') {
                mockStorage.addCredits(targetUserId, 5);
                console.log(`🎁 5 credits awarded to ${targetUserId} upon verification`);
            }

            return res.json({
                success: true,
                message: `Başvuru ${status === 'VERIFIED' ? 'onaylandı' : 'reddedildi'} (Test Modu).`,
                data: { userId: targetUserId, verificationStatus: status }
            });
        }

        try {
            const currentProfile = await prisma.electricianProfile.findUnique({
                where: { userId: targetUserId }
            });

            if (!currentProfile) {
                return res.status(404).json({
                    success: false,
                    error: { message: 'Kullanıcı profili bulunamadı' },
                });
            }

            const verificationDocuments: any = currentProfile.verificationDocuments || {};

            const updatedProfile = await prisma.electricianProfile.update({
                where: { userId: targetUserId },
                data: {
                    verificationStatus: status,
                    licenseVerified: status === 'VERIFIED',
                    verificationDocuments: {
                        ...verificationDocuments,
                        reviewedAt: new Date().toISOString(),
                        reviewedBy: adminUser.id,
                        rejectionReason: status === 'REJECTED' ? reason : undefined,
                    },
                },
            });

            // Also update the main User table isVerified field if approved
            if (status === 'VERIFIED') {
                await prisma.user.update({
                    where: { id: targetUserId },
                    data: { isVerified: true }
                });
            }

            // --- NOTIFICATION LOGIC ---
            const notificationTitle = status === 'VERIFIED' ? 'Üyeliğiniz Onaylandı! 🎉' : 'Belge Onay Hatası ❌';
            const notificationMessage = status === 'VERIFIED'
                ? 'Tebrikler, belgeleriniz onaylandı! Artık "Onaylı Usta" rozeti ile daha fazla iş alabilirsiniz.'
                : (reason || 'Yüklediğiniz belgeler uygun görülmedi. Lütfen eksiklikleri giderip tekrar yükleyin.');

            try {
                // 1. In-App Socket Notification
                notifyUser(targetUserId, 'notification', {
                    type: status === 'VERIFIED' ? 'verification_approved' : 'verification_rejected',
                    title: notificationTitle,
                    message: notificationMessage,
                });

                // 2. Database Notification (If DB is available)
                if (isDatabaseAvailable && !targetUserId.startsWith('mock-')) {
                    await prisma.notification.create({
                        data: {
                            userId: targetUserId,
                            type: status === 'VERIFIED' ? 'VERIFICATION_SUCCESS' : 'VERIFICATION_FAILED',
                            title: notificationTitle,
                            message: notificationMessage,
                            relatedType: 'USER_PROFILE',
                            relatedId: targetUserId,
                        }
                    });

                    // 3. Push Notification (If token exists)
                    const targetUser = await prisma.user.findUnique({
                        where: { id: targetUserId },
                        select: { pushToken: true }
                    });

                    if (targetUser?.pushToken) {
                        await pushNotificationService.sendNotification({
                            to: targetUser.pushToken,
                            title: notificationTitle,
                            body: notificationMessage,
                            data: { type: 'verification_status', status }
                        });
                    }
                } else {
                    console.log(`📡 Mock notification triggered for user ${targetUserId}: ${notificationTitle}`);
                }
            } catch (notifErr) {
                console.error('Notification trigger error in processVerification:', notifErr);
            }

            res.json({
                success: true,
                message: `Başvuru ${status === 'VERIFIED' ? 'onaylandı' : 'reddedildi'}.`,
                data: updatedProfile,
            });
        } catch (dbErr: any) {
            console.error('Database error in processVerification:', dbErr.message);
            res.json({
                success: true,
                message: `Başvuru ${status === 'VERIFIED' ? 'onaylandı' : 'reddedildi'} (Simüle Edildi).`,
                data: { userId: targetUserId, verificationStatus: status }
            });
        }
    } catch (error) {
        console.error('Error in processVerification:', error);
        next(error);
    }
};

// Imports moved to top
// Imports moved to top
export const getDashboardStats = async (req: Request, res: Response, next: NextFunction) => {
    console.log('📊 getDashboardStats called');
    try {
        const user = (req as any).user;
        if (user.userType !== 'ADMIN') throw new Error('Unauthorized');

        // FAST PATH: Mock results if DB down
        if (!isDatabaseAvailable) {
            // ... Existing Mock Logic ...
            const allUsers = mockStorage.getAllUsers();
            const users = Object.values(allUsers);
            const totalUsers = users.length;
            const totalElectricians = users.filter((u: any) => u.userType === 'ELECTRICIAN').length;
            const totalCitizens = users.filter((u: any) => u.userType === 'CITIZEN').length;

            if (jobStoreById.size === 0) loadMockJobs();
            let activeJobsCount = 0;
            jobStoreById.forEach((job) => { if (job.status === 'OPEN') activeJobsCount++; });
            const pendingCount = users.filter((u: any) => u.verificationStatus === 'PENDING').length;

            const transactions = mockTransactionStorage.getAllTransactions();
            const totalRevenue = transactions.filter(t => t.transactionType === 'PURCHASE').reduce((sum, t) => sum + t.amount, 0);

            return res.json({
                success: true,
                data: {
                    totalUsers,
                    totalElectricians,
                    totalCitizens,
                    activeJobs: activeJobsCount,
                    pendingVerifications: pendingCount,
                    totalRevenue
                }
            });
        }

        // REAL DB STATS
        const [
            totalUsers,
            totalElectricians,
            totalCitizens,
            activeJobs,
            pendingVerifications,
        ] = await Promise.all([
            prisma.user.count(),
            prisma.user.count({ where: { userType: 'ELECTRICIAN' } }),
            prisma.user.count({ where: { userType: 'CITIZEN' } }),
            prisma.jobPost.count({ where: { status: 'OPEN' } }),
            prisma.electricianProfile.count({ where: { verificationStatus: 'PENDING' } }),
        ]);

        // Revenue calculation (if you have a Transaction table, otherwise 0 or mock)
        // const totalRevenue = await prisma.transaction.aggregate({ _sum: { amount: true } });
        const totalRevenue = 0; // Placeholder until real transaction table matches

        res.json({
            success: true,
            data: {
                totalUsers,
                totalElectricians,
                totalCitizens,
                activeJobs,
                pendingVerifications,
                totalRevenue
            }
        });

    } catch (error) {
        next(error);
    }
};

/**
 * Get All Jobs for Administration
 * Admin ONLY
 */
export const getAllJobs = async (req: Request, res: Response, next: NextFunction) => {
    console.log('📋 getAllJobs called');
    try {
        const user = (req as any).user;
        if (user.userType !== 'ADMIN') throw new Error('Unauthorized');

        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;
        const skip = (page - 1) * limit;

        if (isDatabaseAvailable) {
            const [jobs, totalJobs] = await Promise.all([
                prisma.jobPost.findMany({
                    skip,
                    take: limit,
                    include: {
                        citizen: {
                            select: { fullName: true, email: true, phone: true }
                        },
                        _count: { select: { bids: true } }
                    },
                    orderBy: { createdAt: 'desc' }
                }),
                prisma.jobPost.count()
            ]);

            const totalPages = Math.ceil(totalJobs / limit);

            // Remap citizen to user for frontend compatibility
            const mappedJobs = jobs.map(j => ({
                ...j,
                user: j.citizen
            }));

            return res.json({
                success: true,
                data: mappedJobs,
                pagination: {
                    page,
                    limit,
                    totalJobs,
                    totalPages,
                    hasMore: page < totalPages
                }
            });
        }

        // Mock Implementation
        if (jobStoreById.size === 0) loadMockJobs();
        const jobs = Array.from(jobStoreById.values());
        jobs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        const paginatedJobs = jobs.slice(skip, skip + limit);
        const totalJobs = jobs.length;
        const totalPages = Math.ceil(totalJobs / limit);

        res.json({
            success: true,
            data: paginatedJobs,
            pagination: {
                page,
                limit,
                totalJobs,
                totalPages,
                hasMore: page < totalPages
            }
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Get All Users for Administration
 * Admin ONLY
 */
export const getAllUsers = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const user = (req as any).user;
        if (user.userType !== 'ADMIN') throw new Error('Unauthorized');

        const { search, userType: filterType, page = '1', limit = '20' } = req.query;
        const pageNum = parseInt(page as string, 10);
        const limitNum = parseInt(limit as string, 10);
        const skip = (pageNum - 1) * limitNum;

        // DB Implementation
        if (isDatabaseAvailable) {
            const whereClause: any = {};

            if (filterType && filterType !== 'ALL') {
                whereClause.userType = filterType;
            }

            if (search) {
                whereClause.OR = [
                    { fullName: { contains: search as string, mode: 'insensitive' } },
                    { email: { contains: search as string, mode: 'insensitive' } },
                    { phone: { contains: search as string } }
                ];
            }

            const [users, totalUsers] = await Promise.all([
                prisma.user.findMany({
                    where: whereClause,
                    skip,
                    take: limitNum,
                    include: {
                        electricianProfile: true,
                        _count: { select: { jobPosts: true } } // Approximate completed jobs
                    },
                    orderBy: { createdAt: 'desc' }
                }),
                prisma.user.count({ where: whereClause })
            ]);

            // Transform to match frontend expectations
            const transformedUsers = users.map(u => ({
                id: u.id,
                fullName: u.fullName,
                email: u.email,
                phone: u.phone,
                userType: u.userType,
                profileImageUrl: u.profileImageUrl,
                creditBalance: u.electricianProfile?.creditBalance || 0,
                isVerified: u.isVerified,
                isActive: u.isActive,
                verificationStatus: u.electricianProfile?.verificationStatus || null,
                createdAt: u.createdAt,
                experienceYears: u.electricianProfile?.experienceYears || 0,
                serviceCategory: u.electricianProfile?.serviceCategory || null,
                completedJobsCount: u.electricianProfile?.completedJobsCount || 0
            }));

            return res.json({
                success: true,
                data: {
                    users: transformedUsers,
                    pagination: {
                        total: totalUsers,
                        page: pageNum,
                        limit: limitNum,
                        totalPages: Math.ceil(totalUsers / limitNum)
                    }
                }
            });
        }

        // Mock Implementation (Moved from routes)
        const allUsers = mockStorage.getAllUsers();
        let users = Object.entries(allUsers).map(([id, data]: [string, any]) => {
            // ... existing mock transformation ...
            let derivedUserType = data.userType;
            if (!derivedUserType) {
                if (id.endsWith('-ELECTRICIAN')) derivedUserType = 'ELECTRICIAN';
                else if (id.endsWith('-ADMIN')) derivedUserType = 'ADMIN';
                else derivedUserType = 'CITIZEN';
            }
            return {
                id,
                fullName: data.fullName || 'İsimsiz Kullanıcı',
                email: data.email || '',
                phone: data.phone || '',
                userType: derivedUserType,
                // ... other fields
                ...data
            };
        });

        if (filterType && filterType !== 'ALL') {
            users = users.filter(u => u.userType === filterType);
        }

        if (search) {
            const searchLower = (search as string).toLowerCase();
            users = users.filter(u =>
                u.fullName.toLowerCase().includes(searchLower) ||
                u.phone.includes(searchLower) ||
                u.email.toLowerCase().includes(searchLower)
            );
        }

        const paginatedUsers = users.slice(skip, skip + limitNum);

        res.json({
            success: true,
            data: {
                users: paginatedUsers,
                pagination: {
                    total: users.length,
                    page: pageNum,
                    limit: limitNum,
                    totalPages: Math.ceil(users.length / limitNum)
                }
            }
        });

    } catch (error) {
        next(error);
    }
};

/**
 * Delete a Job (Admin Force Delete)
 * Admin ONLY
 */
export const deleteJob = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const user = (req as any).user;
        if (user.userType !== 'ADMIN') throw new Error('Unauthorized');

        const { id } = req.params;

        if (isDatabaseAvailable && !id.startsWith('mock-')) {
            // DB Implementation
            try {
                await prisma.jobPost.delete({ where: { id } });
                console.log(`🗑️ Database job deleted: ${id}`);

                // Also remove from mock store if it exists there to keep sync
                if (jobStoreById.has(id)) {
                    deleteMockJob(id);
                }

                return res.json({ success: true, message: 'İlan veritabanından silindi' });
            } catch (dbError) {
                console.error('Database deletion error:', dbError);
                // Fallthrough to mock deletion or return error if confirmed DB ID
                return res.status(500).json({ success: false, message: 'İlan silinirken veritabanı hatası oluştu' });
            }
        }

        // Mock Implementation
        const success = deleteMockJob(id);

        if (success) {
            res.json({ success: true, message: 'İlan silindi' });
        } else {
            res.status(404).json({ success: false, message: 'İlan bulunamadı' });
        }
    } catch (error) {
        next(error);
    }
};
