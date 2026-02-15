import { Request, Response, NextFunction } from 'express';
import * as blockService from '../services/blockService';

/**
 * POST /api/v1/users/block
 * Body: { blockedUserId: string, reason?: string }
 */
export const blockUserController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const blockerId = (req as any).user.id;
        const { blockedUserId, reason } = req.body;

        if (!blockedUserId) {
            return res.status(400).json({
                success: false,
                error: { message: 'blockedUserId gereklidir.', code: 'MISSING_FIELD' },
            });
        }

        const block = await blockService.blockUser(blockerId, blockedUserId, reason);

        res.status(201).json({
            success: true,
            data: block,
            message: 'Kullanıcı başarıyla engellendi.',
        });
    } catch (error: any) {
        if (error.message?.includes('zaten engellenmiş') || error.message?.includes('Kendinizi')) {
            return res.status(409).json({
                success: false,
                error: { message: error.message, code: 'BLOCK_CONFLICT' },
            });
        }
        next(error);
    }
};

/**
 * DELETE /api/v1/users/block/:userId
 */
export const unblockUserController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const blockerId = (req as any).user.id;
        const blockedId = req.params.userId;

        await blockService.unblockUser(blockerId, blockedId);

        res.json({
            success: true,
            message: 'Kullanıcı engeli kaldırıldı.',
        });
    } catch (error: any) {
        if (error.message?.includes('engellenmiş değil')) {
            return res.status(404).json({
                success: false,
                error: { message: error.message, code: 'NOT_BLOCKED' },
            });
        }
        next(error);
    }
};

/**
 * GET /api/v1/users/blocked
 */
export const getBlockedUsersController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = (req as any).user.id;
        const blockedUsers = await blockService.getBlockedUsers(userId);

        res.json({
            success: true,
            data: blockedUsers,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * GET /api/v1/users/block/:userId/status
 */
export const checkBlockStatusController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const currentUserId = (req as any).user.id;
        const targetUserId = req.params.userId;

        const status = await blockService.getBlockStatus(currentUserId, targetUserId);

        res.json({
            success: true,
            data: status,
        });
    } catch (error) {
        next(error);
    }
};
