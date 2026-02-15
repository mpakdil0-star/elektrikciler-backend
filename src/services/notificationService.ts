import prisma, { isDatabaseAvailable } from '../config/database';
import { logger } from '../utils/logger';

// In-memory mock notification storage: userId -> notifications[]
const mockNotifications = new Map<string, any[]>();

export interface NotificationData {
    userId: string;
    type: string;
    title: string;
    message: string;
    relatedType?: string;
    relatedId?: string;
    actionUrl?: string;
}

/**
 * Gönderilen bildirimi kalıcı hale getirir (DB veya Mock)
 */
export const saveNotification = async (notif: NotificationData) => {
    try {
        if (!isDatabaseAvailable || notif.userId.startsWith('mock-')) {
            // Mock Storage
            if (!mockNotifications.has(notif.userId)) {
                mockNotifications.set(notif.userId, []);
            }
            const userNotifs = mockNotifications.get(notif.userId) || [];

            const newNotif = {
                id: `mock-notif-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                ...notif,
                isRead: false,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            userNotifs.unshift(newNotif);
            mockNotifications.set(notif.userId, userNotifs);
            logger.info(`✅ Mock notification saved for user ${notif.userId}: ${notif.title}`);
            return newNotif;
        } else {
            // Database Storage
            const dbNotif = await prisma.notification.create({
                data: {
                    userId: notif.userId,
                    type: notif.type,
                    title: notif.title,
                    message: notif.message,
                    relatedType: notif.relatedType || null,
                    relatedId: notif.relatedId || null,
                    actionUrl: notif.actionUrl || null,
                }
            });
            return dbNotif;
        }
    } catch (error) {
        logger.error('❌ Error saving notification:', error);
        return null;
    }
};

export const getNotificationsByUserId = async (userId: string) => {
    if (!isDatabaseAvailable || userId.startsWith('mock-')) {
        return mockNotifications.get(userId) || [];
    }

    return await prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 50
    });
};

export const getUnreadCountByUserId = async (userId: string) => {
    if (!isDatabaseAvailable || userId.startsWith('mock-')) {
        const notifs = mockNotifications.get(userId) || [];
        return notifs.filter(n => !n.isRead).length;
    }

    return await prisma.notification.count({
        where: { userId, isRead: false }
    });
};

export const markAsReadById = async (userId: string, notificationId: string) => {
    if (!isDatabaseAvailable || userId.startsWith('mock-') || notificationId.startsWith('mock-')) {
        const notifs = mockNotifications.get(userId) || [];
        const notif = notifs.find(n => n.id === notificationId);
        if (notif) {
            notif.isRead = true;
            return true;
        }
        return false;
    }

    await prisma.notification.updateMany({
        where: { id: notificationId, userId },
        data: { isRead: true }
    });
    return true;
};

export const markAllAsReadByUserId = async (userId: string) => {
    if (!isDatabaseAvailable || userId.startsWith('mock-')) {
        const notifs = mockNotifications.get(userId) || [];
        notifs.forEach(n => n.isRead = true);
        return true;
    }

    await prisma.notification.updateMany({
        where: { userId, isRead: false },
        data: { isRead: true }
    });
    return true;
};

export const markRelatedAsRead = async (userId: string, type: string, relatedId: string) => {
    if (!isDatabaseAvailable || userId.startsWith('mock-')) {
        const notifs = mockNotifications.get(userId) || [];
        notifs.forEach(n => {
            if (n.type === type && n.relatedId === relatedId) {
                n.isRead = true;
            }
        });
        return true;
    }

    await prisma.notification.updateMany({
        where: { userId, type, relatedId, isRead: false },
        data: { isRead: true }
    });
    return true;
};

export const deleteNotificationById = async (userId: string, notificationId: string) => {
    if (!isDatabaseAvailable || userId.startsWith('mock-') || notificationId.startsWith('mock-')) {
        const notifs = mockNotifications.get(userId) || [];
        const index = notifs.findIndex(n => n.id === notificationId);
        if (index !== -1) {
            notifs.splice(index, 1);
            return true;
        }
        return false;
    }

    await prisma.notification.deleteMany({
        where: { id: notificationId, userId }
    });
    return true;
};
