import prisma, { isDatabaseAvailable } from '../config/database';
import { AppError } from '../utils/errors';
import pushNotificationService from './pushNotificationService';
import { notifyUser } from '../server';

export const messageService = {
    /**
     * Mesaj gönder (HTTP fallback - Socket.io kullanılamıyorsa)
     */
    async sendMessage(
        conversationId: string,
        senderId: string,
        content: string,
        messageType: 'TEXT' | 'IMAGE' | 'FILE' = 'TEXT'
    ) {
        // Konuşmayı bul
        const conversation = await prisma.conversation.findFirst({
            where: {
                id: conversationId,
                OR: [
                    { participant1Id: senderId },
                    { participant2Id: senderId },
                ],
            },
        });

        if (!conversation) {
            throw new AppError('Konuşma bulunamadı veya erişim reddedildi', 404);
        }

        // Alıcıyı belirle
        const recipientId = conversation.participant1Id === senderId
            ? conversation.participant2Id
            : conversation.participant1Id;

        // Mesajı kaydet
        const message = await prisma.message.create({
            data: {
                conversationId,
                senderId,
                recipientId,
                content,
                messageType,
            },
            include: {
                sender: {
                    select: {
                        id: true,
                        fullName: true,
                        profileImageUrl: true,
                    },
                },
            },
        });

        // Konuşmayı güncelle
        const updateData: any = {
            lastMessageAt: new Date(),
            lastMessagePreview: content.substring(0, 100),
        };

        // Okunmamış mesaj sayısını artır
        if (conversation.participant1Id === recipientId) {
            updateData.unreadCountParticipant1 = { increment: 1 };
        } else {
            updateData.unreadCountParticipant2 = { increment: 1 };
        }

        await prisma.conversation.update({
            where: { id: conversationId },
            data: updateData,
        });

        // Notify recipient via push/socket
        try {
            const recipient = await prisma.user.findUnique({
                where: { id: recipientId },
                select: { id: true, pushToken: true }
            });

            if (recipient) {
                // 1. Send real-time socket notification (if not already handled by socketHandler)
                // Note: socketHandler handles real-time messaging, this is for background/push

                // 2. Save Notification to DB (usually messages don't create separate notifications in list, 
                // but for critical stuff they might. Here we just rely on unreadCount)

                // 3. Send Push Notification if token exists
                if (recipient.pushToken) {
                    await pushNotificationService.sendNotification({
                        to: recipient.pushToken,
                        title: message.sender.fullName,
                        body: messageType === 'TEXT' ? content : `[Fotoğraf Gönderildi]`,
                        data: { conversationId, type: 'new_message' }
                    });
                }
            }
        } catch (notifyError) {
            console.error('Failed to send push for new message:', notifyError);
        }

        return message;
    },

    /**
     * Mesajları okundu olarak işaretle
     */
    async markAsRead(conversationId: string, userId: string) {
        const conversation = await prisma.conversation.findFirst({
            where: {
                id: conversationId,
                OR: [
                    { participant1Id: userId },
                    { participant2Id: userId },
                ],
            },
        });

        if (!conversation) {
            throw new AppError('Konuşma bulunamadı', 404);
        }

        // Okunmamış mesajları güncelle
        await prisma.message.updateMany({
            where: {
                conversationId,
                recipientId: userId,
                isRead: false,
            },
            data: {
                isRead: true,
                readAt: new Date(),
            },
        });

        // Konuşmadaki okunmamış sayısını sıfırla
        const updateData: any = {};
        if (conversation.participant1Id === userId) {
            updateData.unreadCountParticipant1 = 0;
        } else {
            updateData.unreadCountParticipant2 = 0;
        }

        await prisma.conversation.update({
            where: { id: conversationId },
            data: updateData,
        });

        return { success: true };
    },

    /**
     * Mesaj sil (soft delete)
     */
    async deleteMessage(messageId: string, userId: string) {
        const message = await prisma.message.findFirst({
            where: {
                id: messageId,
                senderId: userId,
            },
        });

        if (!message) {
            throw new AppError('Mesaj bulunamadı veya silme yetkiniz yok', 404);
        }

        await prisma.message.update({
            where: { id: messageId },
            data: {
                isDeleted: true,
                deletedAt: new Date(),
            },
        });

        return { success: true };
    },
};

export default messageService;
