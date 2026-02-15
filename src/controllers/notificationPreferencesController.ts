import { Request, Response, NextFunction } from 'express';

interface AuthRequest extends Request {
    user?: {
        id: string;
        email: string;
        userType: string;
    };
}

// In-memory storage for notification preferences
const notificationPreferencesCache = new Map<string, {
    pushEnabled: boolean;
    emailEnabled: boolean;
    promoEnabled: boolean;
    securityEnabled: boolean;
}>();

// Default preferences
const defaultPreferences = {
    pushEnabled: true,
    emailEnabled: true,
    promoEnabled: false,
    securityEnabled: true,
};

/**
 * GET /users/notification-preferences
 * Kullanıcının bildirim tercihlerini getir
 */
export const getNotificationPreferences = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                error: { message: 'Unauthorized' },
            });
        }

        const userId = req.user.id;

        // Get from cache or return defaults
        const preferences = notificationPreferencesCache.get(userId) || defaultPreferences;

        res.json({
            success: true,
            data: preferences,
        });
    } catch (error: any) {
        console.error('Error getting notification preferences:', error);
        res.json({
            success: true,
            data: defaultPreferences,
        });
    }
};

/**
 * PUT /users/notification-preferences
 * Kullanıcının bildirim tercihlerini güncelle
 */
export const updateNotificationPreferences = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                error: { message: 'Unauthorized' },
            });
        }

        const userId = req.user.id;
        const { pushEnabled, emailEnabled, promoEnabled, securityEnabled } = req.body;

        const updatedPreferences = {
            pushEnabled: pushEnabled ?? true,
            emailEnabled: emailEnabled ?? true,
            promoEnabled: promoEnabled ?? false,
            securityEnabled: securityEnabled ?? true,
        };

        // Update cache
        notificationPreferencesCache.set(userId, updatedPreferences);

        res.json({
            success: true,
            data: updatedPreferences,
            message: 'Bildirim tercihleri güncellendi',
        });
    } catch (error: any) {
        console.error('Error updating notification preferences:', error);
        res.status(500).json({
            success: false,
            error: { message: 'Tercihler güncellenemedi' },
        });
    }
};

