import { Request, Response, NextFunction } from 'express';
import prisma, { isDatabaseAvailable } from '../config/database';
import { mockStorage, mockReviewStorage } from '../utils/mockStorage';

/**
 * Submit a review for an electrician
 */
export const submitReview = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = (req as any).user?.id;
        const userFullName = (req as any).user?.fullName || 'Anonim';

        if (!userId) {
            return res.status(401).json({
                success: false,
                error: { message: 'Oturum açmanız gerekiyor' }
            });
        }

        const { electricianId, rating, comment, jobId } = req.body;

        if (!electricianId || !rating) {
            return res.status(400).json({
                success: false,
                error: { message: 'Elektrikçi ID ve puan gerekli' }
            });
        }

        if (rating < 1 || rating > 5) {
            return res.status(400).json({
                success: false,
                error: { message: 'Puan 1-5 arasında olmalı' }
            });
        }

        // Check if already reviewed
        if (mockReviewStorage.hasReviewed(userId, electricianId, jobId)) {
            return res.status(400).json({
                success: false,
                error: { message: 'Bu elektrikçiyi zaten değerlendirdiniz' }
            });
        }

        // Mock mode - always use this for now
        const review = mockReviewStorage.addReview({
            electricianId,
            reviewerId: userId,
            reviewerName: userFullName,
            rating: Number(rating),
            comment: comment || '',
            jobId
        });

        return res.status(201).json({
            success: true,
            message: 'Değerlendirmeniz kaydedildi',
            data: review
        });
    } catch (error) {
        console.error('Error in submitReview:', error);
        next(error);
    }
};

/**
 * Get reviews for an electrician
 */
export const getElectricianReviews = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { electricianId } = req.params;

        // Mock mode - always use this for now
        const reviews = mockReviewStorage.getReviewsForElectrician(electricianId);
        const stats = mockReviewStorage.getRatingStats(electricianId);

        return res.status(200).json({
            success: true,
            data: {
                reviews: reviews.map(r => ({
                    id: r.id,
                    rating: r.rating,
                    comment: r.comment,
                    createdAt: r.createdAt,
                    reviewer: {
                        fullName: r.reviewerName,
                        profileImageUrl: null
                    }
                })),
                stats
            }
        });
    } catch (error) {
        console.error('Error in getElectricianReviews:', error);
        next(error);
    }
};
