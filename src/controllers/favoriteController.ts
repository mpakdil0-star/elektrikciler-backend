import { Request, Response, NextFunction } from 'express';
import { isDatabaseAvailable } from '../config/database';
import { mockStorage, mockFavoriteStorage } from '../utils/mockStorage';

interface AuthRequest extends Request {
    user?: {
        id: string;
        email: string;
        userType: string;
    };
}

// Get user's favorites
export const getFavorites = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                error: { message: 'Unauthorized' },
            });
        }

        if (isDatabaseAvailable) {
            try {
                const favoriteService = (await import('../services/favoriteService')).default;
                const favorites = await favoriteService.getFavorites(req.user.id);
                return res.json({
                    success: true,
                    data: { favorites },
                });
            } catch (dbError: any) {
                console.warn('Database service error, falling back to mock:', dbError.message);
            }
        }

        // MOCK MODE: Handle favorites via mockStorage
        const mockFavs = mockFavoriteStorage.getFavorites(req.user.id);
        const enrichedFavorites = mockFavs.map(fav => {
            const electrician = mockStorage.get(fav.electricianId);
            return {
                id: fav.id,
                electricianId: fav.electricianId,
                createdAt: fav.createdAt,
                electrician: {
                    id: fav.electricianId,
                    fullName: electrician?.fullName || 'Bilinmeyen Usta',
                    profileImageUrl: electrician?.profileImageUrl || null,
                    rating: 4.5, // Default for mock
                    reviewCount: 10,
                    completedJobs: electrician?.completedJobsCount || 0,
                    specialties: electrician?.specialties || [],
                    isAvailable: true
                }
            };
        });

        res.json({
            success: true,
            data: { favorites: enrichedFavorites },
        });

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

// Add to favorites
export const addFavorite = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                error: { message: 'Unauthorized' },
            });
        }

        const { electricianId } = req.params;

        if (isDatabaseAvailable) {
            try {
                const favoriteService = (await import('../services/favoriteService')).default;
                const favorite = await favoriteService.addFavorite(req.user.id, electricianId);

                return res.status(201).json({
                    success: true,
                    data: { favorite },
                    message: 'Favorilere eklendi',
                });
            } catch (dbError: any) {
                console.warn('Database error while adding favorite, falling back to mock:', dbError.message);
            }
        }

        // MOCK MODE
        const favorite = mockFavoriteStorage.addFavorite(req.user.id, electricianId);
        res.status(201).json({
            success: true,
            data: { favorite },
            message: 'Favorilere eklendi (Mock)',
        });

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

// Remove from favorites
export const removeFavorite = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                error: { message: 'Unauthorized' },
            });
        }

        const { electricianId } = req.params;

        if (isDatabaseAvailable) {
            try {
                const favoriteService = (await import('../services/favoriteService')).default;
                await favoriteService.removeFavorite(req.user.id, electricianId);

                return res.json({
                    success: true,
                    message: 'Favorilerden çıkarıldı',
                });
            } catch (dbError: any) {
                console.warn('Database error while removing favorite, falling back to mock:', dbError.message);
            }
        }

        // MOCK MODE
        mockFavoriteStorage.removeFavorite(req.user.id, electricianId);
        res.json({
            success: true,
            message: 'Favorilerden çıkarıldı (Mock)',
        });

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

// Check if electrician is in favorites
export const checkFavorite = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                error: { message: 'Unauthorized' },
            });
        }

        const { electricianId } = req.params;

        if (isDatabaseAvailable) {
            try {
                const favoriteService = (await import('../services/favoriteService')).default;
                const result = await favoriteService.checkFavorite(req.user.id, electricianId);

                return res.json({
                    success: true,
                    data: result,
                });
            } catch (dbError: any) {
                console.warn('Database error checking favorite, falling back to mock:', dbError.message);
            }
        }

        // MOCK MODE
        const isFav = mockFavoriteStorage.isFavorite(req.user.id, electricianId);
        res.json({
            success: true,
            data: { isFavorite: isFav },
        });

    } catch (error: any) {
        next(error);
    }
};

