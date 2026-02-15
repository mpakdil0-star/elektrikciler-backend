import prisma from '../config/database';
import { AppError } from '../utils/errors';

export const favoriteService = {
    /**
     * Kullanıcının favorilerini getir
     */
    async getFavorites(userId: string) {
        const favorites = await prisma.favorite.findMany({
            where: { userId },
            include: {
                electrician: {
                    select: {
                        id: true,
                        fullName: true,
                        profileImageUrl: true,
                        electricianProfile: {
                            select: {
                                ratingAverage: true,
                                totalReviews: true,
                                completedJobsCount: true,
                                specialties: true,
                                isAvailable: true,
                            },
                        },
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
        });

        return favorites.map((fav) => ({
            id: fav.id,
            electricianId: fav.electricianId,
            createdAt: fav.createdAt,
            electrician: {
                id: fav.electrician.id,
                fullName: fav.electrician.fullName,
                profileImageUrl: fav.electrician.profileImageUrl,
                rating: fav.electrician.electricianProfile?.ratingAverage || 0,
                reviewCount: fav.electrician.electricianProfile?.totalReviews || 0,
                completedJobs: fav.electrician.electricianProfile?.completedJobsCount || 0,
                specialties: fav.electrician.electricianProfile?.specialties || [],
                isAvailable: fav.electrician.electricianProfile?.isAvailable ?? true,
            },
        }));
    },

    /**
     * Favorilere ekle
     */
    async addFavorite(userId: string, electricianId: string) {
        // Elektrikçiyi kontrol et
        const electrician = await prisma.user.findUnique({
            where: { id: electricianId },
            select: { id: true, userType: true },
        });

        if (!electrician) {
            throw new AppError('Elektrikçi bulunamadı', 404);
        }

        if (electrician.userType !== 'ELECTRICIAN') {
            throw new AppError('Sadece elektrikçiler favorilere eklenebilir', 400);
        }

        if (userId === electricianId) {
            throw new AppError('Kendinizi favorilere ekleyemezsiniz', 400);
        }

        // Zaten favorilerde mi kontrol et
        const existing = await prisma.favorite.findUnique({
            where: {
                userId_electricianId: { userId, electricianId },
            },
        });

        if (existing) {
            throw new AppError('Bu elektrikçi zaten favorilerinizde', 400);
        }

        const favorite = await prisma.favorite.create({
            data: {
                userId,
                electricianId,
            },
            include: {
                electrician: {
                    select: {
                        id: true,
                        fullName: true,
                        profileImageUrl: true,
                    },
                },
            },
        });

        return favorite;
    },

    /**
     * Favorilerden çıkar
     */
    async removeFavorite(userId: string, electricianId: string) {
        const favorite = await prisma.favorite.findUnique({
            where: {
                userId_electricianId: { userId, electricianId },
            },
        });

        if (!favorite) {
            throw new AppError('Bu elektrikçi favorilerinizde değil', 404);
        }

        await prisma.favorite.delete({
            where: { id: favorite.id },
        });

        return { success: true };
    },

    /**
     * Favori durumunu kontrol et
     */
    async checkFavorite(userId: string, electricianId: string) {
        const favorite = await prisma.favorite.findUnique({
            where: {
                userId_electricianId: { userId, electricianId },
            },
        });

        return { isFavorite: !!favorite };
    },
};

export default favoriteService;
