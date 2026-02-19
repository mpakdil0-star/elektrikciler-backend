import { Request, Response, NextFunction } from 'express';
import prisma, { isDatabaseAvailable } from '../config/database';
import { mockReportStorage, mockStorage } from '../utils/mockStorage';
import { AuthRequest } from '../middleware/auth';

// Report status and reason types (matching schema.prisma enums)
type ReportStatus = 'PENDING' | 'UNDER_REVIEW' | 'RESOLVED' | 'DISMISSED';
type ReportReason = 'FRAUD' | 'HARASSMENT' | 'NO_SHOW' | 'UNPROFESSIONAL' | 'FAKE_PROFILE' | 'SPAM' | 'INAPPROPRIATE_CONTENT' | 'OTHER';

// Create a new report
export const createReport = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const reporterId = req.user?.id;
        const { reportedId, jobId, reason, description, evidence } = req.body;

        if (!reporterId) {
            return res.status(401).json({ success: false, message: 'Giriş yapmanız gerekiyor' });
        }

        // Can't report yourself
        if (reporterId === reportedId) {
            return res.status(400).json({ success: false, message: 'Kendinizi şikayet edemezsiniz' });
        }

        if (isDatabaseAvailable) {
            // Check for duplicate report
            const existingReport = await prisma.report.findFirst({
                where: {
                    reporterId,
                    reportedId,
                    status: 'PENDING'
                }
            });

            if (existingReport) {
                return res.status(400).json({
                    success: false,
                    message: 'Bu kullanıcı için bekleyen bir şikayetiniz zaten var'
                });
            }

            const report = await prisma.report.create({
                data: {
                    reporterId,
                    reportedId,
                    jobId,
                    reason,
                    description,
                    evidence: evidence || [],
                    status: 'PENDING'
                }
            });

            return res.status(201).json({
                success: true,
                message: 'Şikayetiniz başarıyla gönderildi. En kısa sürede incelenecektir.',
                data: report
            });
        }

        // Mock Fallback
        const existingReport = mockReportStorage.findFirst({
            reporterId,
            reportedId,
            status: 'PENDING'
        });

        if (existingReport) {
            return res.status(400).json({
                success: false,
                message: 'Bu kullanıcı için bekleyen bir şikayetiniz zaten var'
            });
        }

        const report = mockReportStorage.create({
            reporterId,
            reportedId,
            jobId,
            reason: reason as ReportReason,
            description,
            evidence: evidence || [],
            status: 'PENDING'
        });

        return res.status(201).json({
            success: true,
            message: 'Şikayetiniz başarıyla gönderildi. En kısa sürede incelenecektir.',
            data: report
        });
    } catch (error) {
        next(error);
    }
};

// Get user's reports
export const getMyReports = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const userId = req.user?.id;

        if (!userId) {
            return res.status(401).json({ success: false, message: 'Giriş yapmanız gerekiyor' });
        }

        if (isDatabaseAvailable) {
            const reports = await prisma.report.findMany({
                where: { reporterId: userId },
                orderBy: { createdAt: 'desc' },
                include: {
                    reported: {
                        select: { fullName: true, id: true }
                    },
                    job: {
                        select: { title: true, id: true }
                    }
                }
            });
            return res.json({ success: true, data: reports });
        }

        const reports = mockReportStorage.findMany({ reporterId: userId });

        return res.json({ success: true, data: reports });
    } catch (error) {
        next(error);
    }
};

// ADMIN: Get all reports
export const getAllReports = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { status, page = 1, limit = 20 } = req.query;

        if (isDatabaseAvailable) {
            const where: any = {};
            if (status) {
                where.status = status;
            }

            const pageNum = Number(page);
            const limitNum = Number(limit);
            const skip = (pageNum - 1) * limitNum;

            const [reports, total] = await Promise.all([
                prisma.report.findMany({
                    where,
                    skip,
                    take: limitNum,
                    orderBy: { createdAt: 'desc' },
                    include: {
                        reporter: {
                            select: { fullName: true, email: true, phone: true }
                        },
                        reported: {
                            select: { fullName: true, email: true, phone: true }
                        },
                        job: {
                            select: { title: true }
                        }
                    }
                }),
                prisma.report.count({ where })
            ]);

            return res.json({
                success: true,
                data: reports,
                pagination: {
                    page: pageNum,
                    limit: limitNum,
                    total,
                    pages: Math.ceil(total / limitNum)
                }
            });
        }

        // Mock Fallback
        const where: any = {};
        if (status) {
            where.status = status as ReportStatus;
        }

        const skip = (Number(page) - 1) * Number(limit);
        const reports = mockReportStorage.findMany(where, skip, Number(limit));
        const total = mockReportStorage.count(where);

        return res.json({
            success: true,
            data: reports,
            pagination: {
                page: Number(page),
                limit: Number(limit),
                total,
                pages: Math.ceil(total / Number(limit))
            }
        });
    } catch (error) {
        next(error);
    }
};

// ADMIN: Update report status
export const updateReportStatus = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const { status, adminNotes, banUser, banUntil } = req.body;
        const adminId = req.user?.id;

        if (isDatabaseAvailable) {
            const report = await prisma.report.update({
                where: { id },
                data: {
                    status,
                    adminNotes,
                    resolvedAt: ['RESOLVED', 'DISMISSED'].includes(status) ? new Date() : null,
                    resolvedBy: ['RESOLVED', 'DISMISSED'].includes(status) ? adminId : null
                }
            });

            // If resolved against the reported user, optionally ban them
            if (status === 'RESOLVED' && banUser) {
                await prisma.user.update({
                    where: { id: report.reportedId },
                    data: {
                        isBanned: true,
                        banReason: `Report #${report.id}: ${adminNotes || 'No reason provided'}`,
                        banUntil: banUntil ? new Date(banUntil) : null
                    }
                });
            }

            return res.json({
                success: true,
                message: 'Şikayet durumu güncellendi',
                data: report
            });
        }

        // Mock Fallback
        const report = mockReportStorage.update(id, {
            status: status as ReportStatus,
            adminNotes,
            resolvedAt: ['RESOLVED', 'DISMISSED'].includes(status) ? new Date().toISOString() : undefined,
            resolvedBy: ['RESOLVED', 'DISMISSED'].includes(status) ? adminId : undefined
        });

        if (!report) {
            return res.status(404).json({ success: false, message: 'Şikayet bulunamadı' });
        }

        if (status === 'RESOLVED' && banUser) {
            mockStorage.updateProfile(report.reportedId, {
                isActive: false // Mock only supports isActive
            });
        }

        return res.json({
            success: true,
            message: 'Şikayet durumu güncellendi',
            data: report
        });
    } catch (error) {
        next(error);
    }
};

// Get report reasons for dropdown
export const getReportReasons = async (req: Request, res: Response) => {
    const reasons = [
        { value: 'FRAUD', label: 'Dolandırıcılık' },
        { value: 'HARASSMENT', label: 'Taciz / Rahatsız Edici Davranış' },
        { value: 'NO_SHOW', label: 'Randevuya Gelmedi' },
        { value: 'UNPROFESSIONAL', label: 'Profesyonel Olmayan Davranış' },
        { value: 'FAKE_PROFILE', label: 'Sahte Profil' },
        { value: 'SPAM', label: 'Spam / İstenmeyen Mesaj' },
        { value: 'INAPPROPRIATE_CONTENT', label: 'Uygunsuz İçerik' },
        { value: 'OTHER', label: 'Diğer' }
    ];

    return res.json({ success: true, data: reasons });
};
