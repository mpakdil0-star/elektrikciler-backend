import prisma, { isDatabaseAvailable } from '../config/database';
import bcrypt from 'bcryptjs';
import { AppError } from '../utils/errors';

export const userService = {
    /**
     * Kullanıcının şifresini değiştirir
     * @param userId - Kullanıcı ID
     * @param currentPassword - Mevcut şifre
     * @param newPassword - Yeni şifre
     */
    async changePassword(
        userId: string,
        currentPassword: string,
        newPassword: string
    ): Promise<void> {
        if (!isDatabaseAvailable) {
            throw new Error('DATABASE_NOT_CONNECTED');
        }

        // Kullanıcıyı bul
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, passwordHash: true },
        });

        if (!user) {
            throw new AppError('Kullanıcı bulunamadı', 404);
        }

        // Mevcut şifreyi doğrula
        const isPasswordValid = await bcrypt.compare(currentPassword, user.passwordHash);
        if (!isPasswordValid) {
            throw new AppError('Mevcut şifre yanlış', 400);
        }

        // Yeni şifre hash'le
        const newPasswordHash = await bcrypt.hash(newPassword, 10);

        // Şifreyi güncelle
        await prisma.user.update({
            where: { id: userId },
            data: {
                passwordHash: newPasswordHash,
                updatedAt: new Date(),
            },
        });
    },

    /**
     * Kullanıcı profilini günceller
     * @param userId - Kullanıcı ID
     * @param data - Güncellenecek alanlar
     */
    async updateProfile(
        userId: string,
        data: {
            fullName?: string;
            phone?: string;
            email?: string;
            specialties?: string[];
            bio?: string;
            experienceYears?: number;
            isAvailable?: boolean;
        }
    ) {
        if (!isDatabaseAvailable) {
            // Mock mode or simple return if DB is down - though usually we want to throw error if we can't save
            throw new Error('DATABASE_NOT_CONNECTED');
        }

        // Get current user to check type and verification status
        const currentUser = await prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, userType: true, phone: true, isVerified: true }
        });

        if (!currentUser) {
            throw new AppError('Kullanıcı bulunamadı', 404);
        }

        const { specialties, bio, experienceYears, isAvailable, phone, ...userData } = data;
        const finalUserData: any = { ...userData };
        const profileData: any = {};

        // Electrician specific profile updates
        if (currentUser.userType === 'ELECTRICIAN') {
            if (specialties !== undefined) profileData.specialties = specialties;
            if (bio !== undefined) profileData.bio = bio;
            if (experienceYears !== undefined) profileData.experienceYears = Number(experienceYears);
            if (isAvailable !== undefined) profileData.isAvailable = (isAvailable as any) === true || (isAvailable as any) === 'true';

            // Phone Bonus and Lock Logic
            if (phone && !currentUser.isVerified) {
                // First time phone entry - provide 5 free credits bonus
                finalUserData.phone = phone;
                finalUserData.isVerified = true;
                profileData.creditBalance = 5;
            } else if (phone && currentUser.isVerified && phone !== currentUser.phone) {
                // Attempt to change verified phone - reject/ignore for security
                console.warn(`User ${userId} attempted to change verified phone number. Operation blocked.`);
            } else if (phone) {
                finalUserData.phone = phone;
            }
        } else {
            // Regular user phone update
            if (phone) finalUserData.phone = phone;
        }

        // Create the data object for Prisma update
        const updateData: any = {
            ...finalUserData,
            updatedAt: new Date(),
        };

        // Add nested electrician profile update if needed
        if (currentUser.userType === 'ELECTRICIAN' && Object.keys(profileData).length > 0) {
            updateData.electricianProfile = {
                upsert: {
                    create: {
                        ...profileData,
                        isAvailable: profileData.isAvailable ?? true,
                        experienceYears: Number(profileData.experienceYears) || 0,
                        specialties: profileData.specialties || []
                    },
                    update: {
                        ...profileData,
                        updatedAt: new Date()
                    }
                }
            };
        }

        // Perform the combined update
        const updatedUser = await prisma.user.update({
            where: { id: userId },
            data: updateData,
            select: {
                id: true,
                email: true,
                fullName: true,
                phone: true,
                userType: true,
                profileImageUrl: true,
                isVerified: true,
                electricianProfile: currentUser.userType === 'ELECTRICIAN' ? {
                    select: {
                        bio: true,
                        experienceYears: true,
                        specialties: true,
                        creditBalance: true,
                        isAvailable: true,
                    }
                } : false
            },
        });

        return updatedUser;
    },

    /**
     * Bildirim ayarlarını günceller
     * @param userId - Kullanıcı ID
     * @param settings - Bildirim ayarları
     */
    async updateNotificationSettings(
        userId: string,
        settings: any
    ) {
        if (!isDatabaseAvailable) {
            throw new Error('DATABASE_NOT_CONNECTED');
        }

        const user = await prisma.user.update({
            where: { id: userId },
            data: {
                notificationSettings: settings,
                updatedAt: new Date(),
            },
            select: {
                id: true,
                notificationSettings: true,
            },
        });

        return user;
    },

    /**
     * Hesabı siler (Soft delete)
     * @param userId - Silinecek kullanıcı ID
     */
    async deleteAccount(userId: string): Promise<void> {
        if (!isDatabaseAvailable) {
            throw new Error('DATABASE_NOT_CONNECTED');
        }

        await prisma.user.update({
            where: { id: userId },
            data: {
                isActive: false,
                deletedAt: new Date(),
                updatedAt: new Date(),
            },
        });
    },
};

export default userService;
