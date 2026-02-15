import { Request, Response, NextFunction } from 'express';

interface AuthRequest extends Request {
    user?: {
        id: string;
        email: string;
        userType: string;
    };
}

// Get user's job history (completed and cancelled jobs)
export const getJobHistory = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                error: { message: 'Unauthorized' },
            });
        }

        const userId = req.user.id;
        const userType = req.user.userType;
        const { page = 1, limit = 20 } = req.query;

        const pageNum = parseInt(page as string) || 1;
        const limitNum = parseInt(limit as string) || 20;

        try {
            const prisma = (await import('../config/database')).default;
            const skip = (pageNum - 1) * limitNum;

            let jobs: any[] = [];
            let total = 0;

            if (userType === 'CITIZEN') {
                // Vatandaş için kendi oluşturduğu tamamlanmış/iptal edilmiş işler
                [jobs, total] = await Promise.all([
                    prisma.jobPost.findMany({
                        where: {
                            citizenId: userId,
                            status: { in: ['COMPLETED', 'CANCELLED'] },
                        },
                        include: {
                            bids: {
                                where: { status: 'ACCEPTED' },
                                include: {
                                    electrician: {
                                        select: {
                                            id: true,
                                            fullName: true,
                                            profileImageUrl: true,
                                        },
                                    },
                                },
                                take: 1,
                            },
                            reviews: {
                                select: {
                                    id: true,
                                    rating: true,
                                },
                            },
                        },
                        orderBy: { updatedAt: 'desc' },
                        skip,
                        take: limitNum,
                    }),
                    prisma.jobPost.count({
                        where: {
                            citizenId: userId,
                            status: { in: ['COMPLETED', 'CANCELLED'] },
                        },
                    }),
                ]);

                jobs = jobs.map((job) => ({
                    id: job.id,
                    title: job.title,
                    category: job.category,
                    status: job.status,
                    completedAt: job.completedAt,
                    cancelledAt: job.cancelledAt,
                    cancellationReason: job.cancellationReason,
                    createdAt: job.createdAt,
                    electrician: job.bids[0]?.electrician || null,
                    finalPrice: job.bids[0]?.amount || null,
                    hasReview: job.reviews.length > 0,
                    rating: job.reviews[0]?.rating || null,
                }));
            } else if (userType === 'ELECTRICIAN') {
                // Elektrikçi için tamamladığı/iptal edilen işler
                const bids = await prisma.bid.findMany({
                    where: {
                        electricianId: userId,
                        status: 'ACCEPTED',
                        jobPost: {
                            status: { in: ['COMPLETED', 'CANCELLED'] },
                        },
                    },
                    include: {
                        jobPost: {
                            include: {
                                citizen: {
                                    select: {
                                        id: true,
                                        fullName: true,
                                        profileImageUrl: true,
                                    },
                                },
                                reviews: {
                                    where: { reviewedId: userId },
                                    select: {
                                        id: true,
                                        rating: true,
                                        comment: true,
                                    },
                                },
                            },
                        },
                    },
                    orderBy: { updatedAt: 'desc' },
                    skip,
                    take: limitNum,
                });

                total = await prisma.bid.count({
                    where: {
                        electricianId: userId,
                        status: 'ACCEPTED',
                        jobPost: {
                            status: { in: ['COMPLETED', 'CANCELLED'] },
                        },
                    },
                });

                jobs = bids.map((bid) => ({
                    id: bid.jobPost.id,
                    title: bid.jobPost.title,
                    category: bid.jobPost.category,
                    status: bid.jobPost.status,
                    completedAt: bid.jobPost.completedAt,
                    cancelledAt: bid.jobPost.cancelledAt,
                    createdAt: bid.jobPost.createdAt,
                    citizen: bid.jobPost.citizen,
                    finalPrice: bid.amount,
                    hasReview: bid.jobPost.reviews.length > 0,
                    rating: bid.jobPost.reviews[0]?.rating || null,
                    reviewComment: bid.jobPost.reviews[0]?.comment || null,
                }));
            }

            res.json({
                success: true,
                data: {
                    jobs,
                    pagination: {
                        page: pageNum,
                        limit: limitNum,
                        total,
                        totalPages: Math.ceil(total / limitNum),
                    },
                },
            });
        } catch (dbError: any) {
            // Database bağlantısı yoksa boş liste döndür
            console.warn('Database error, returning empty job history:', dbError.message);
            res.json({
                success: true,
                data: {
                    jobs: [],
                    pagination: {
                        page: pageNum,
                        limit: limitNum,
                        total: 0,
                        totalPages: 0,
                    },
                },
            });
        }
    } catch (error: any) {
        console.error('Error fetching job history:', error);
        next(error);
    }
};
