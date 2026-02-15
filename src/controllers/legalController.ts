import { Request, Response, NextFunction } from 'express';
import { mockStorage } from '../utils/mockStorage';
import { AuthRequest } from '../middleware/auth';

/**
 * Get all active legal documents/policies
 */
export const getLegalDocuments = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const docs = mockStorage.getLegalDocs();

        // Group by type and only send latest version for each type ideally
        // For now, just send all active ones
        res.json({
            success: true,
            data: docs
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Record a user consent
 */
export const recordConsent = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const { documentType, documentVersion, action, marketingAllowed } = req.body;
        const userId = req.user?.id;

        if (!documentType || !documentVersion || !action) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields'
            });
        }

        // Extract IP and User-Agent
        const ipAddress = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress;
        const userAgent = req.headers['user-agent'];

        const consent = mockStorage.addConsent({
            userId: userId || 'guest',
            documentType,
            documentVersion,
            ipAddress,
            userAgent,
            action: action as 'ACCEPTED' | 'REJECTED'
        });

        // If user is logged in and marketingAllowed is provided, update profile
        if (userId && marketingAllowed !== undefined) {
            mockStorage.updateProfile(userId, { marketingAllowed });
        }

        res.json({
            success: true,
            data: consent
        });
    } catch (error) {
        next(error);
    }
};
