import prisma, { isDatabaseAvailable } from '../config/database';
import { AppError } from '../utils/errors';

export const conversationService = {
    /**
     * Konuşma bul veya oluştur
     */
    async getOrCreateConversation(
        user1Id: string,
        user2Id: string,
        jobPostId?: string
    ) {
        if (!isDatabaseAvailable) {
            throw new Error('DATABASE_NOT_CONNECTED');
        }

        // Mevcut konuşmayı ara
        let conversation = await prisma.conversation.findFirst({
            where: {
                OR: [
                    { participant1Id: user1Id, participant2Id: user2Id },
                    { participant1Id: user2Id, participant2Id: user1Id },
                ],
                ...(jobPostId ? { jobPostId } : {}),
            },
            include: {
                participant1: {
                    select: {
                        id: true,
                        fullName: true,
                        profileImageUrl: true,
                        userType: true,
                    },
                },
                participant2: {
                    select: {
                        id: true,
                        fullName: true,
                        profileImageUrl: true,
                        userType: true,
                    },
                },
                jobPost: {
                    select: {
                        id: true,
                        title: true,
                    },
                },
            },
        });

        // Yoksa oluştur
        if (!conversation) {
            conversation = await prisma.conversation.create({
                data: {
                    participant1Id: user1Id,
                    participant2Id: user2Id,
                    jobPostId,
                },
                include: {
                    participant1: {
                        select: {
                            id: true,
                            fullName: true,
                            profileImageUrl: true,
                            userType: true,
                        },
                    },
                    participant2: {
                        select: {
                            id: true,
                            fullName: true,
                            profileImageUrl: true,
                            userType: true,
                        },
                    },
                    jobPost: {
                        select: {
                            id: true,
                            title: true,
                        },
                    },
                },
            });
        }

        return conversation;
    },

    /**
     * Kullanıcının tüm konuşmalarını getir
     */
    async getConversations(userId: string) {
        if (!isDatabaseAvailable) {
            throw new Error('DATABASE_NOT_CONNECTED');
        }

        const conversations = await prisma.conversation.findMany({
            where: {
                OR: [
                    { participant1Id: userId, isArchivedParticipant1: false },
                    { participant2Id: userId, isArchivedParticipant2: false },
                ],
            },
            include: {
                participant1: {
                    select: {
                        id: true,
                        fullName: true,
                        profileImageUrl: true,
                        userType: true,
                    },
                },
                participant2: {
                    select: {
                        id: true,
                        fullName: true,
                        profileImageUrl: true,
                        userType: true,
                    },
                },
                jobPost: {
                    select: {
                        id: true,
                        title: true,
                    },
                },
                messages: {
                    orderBy: { createdAt: 'desc' },
                    take: 1,
                    select: {
                        id: true,
                        content: true,
                        createdAt: true,
                        senderId: true,
                        isRead: true,
                    },
                },
            },
            orderBy: { lastMessageAt: 'desc' },
        });

        return conversations.map((conv) => {
            const otherUser = conv.participant1Id === userId ? conv.participant2 : conv.participant1;
            const unreadCount = conv.participant1Id === userId
                ? conv.unreadCountParticipant1
                : conv.unreadCountParticipant2;

            return {
                id: conv.id,
                otherUser,
                jobPost: conv.jobPost,
                lastMessage: conv.messages[0] || null,
                lastMessagePreview: conv.lastMessagePreview,
                lastMessageAt: conv.lastMessageAt,
                unreadCount,
                createdAt: conv.createdAt,
                updatedAt: conv.updatedAt,
            };
        });
    },

    /**
     * Tek bir konuşmayı getir
     */
    async getConversation(conversationId: string, userId: string) {
        if (!isDatabaseAvailable) {
            throw new Error('DATABASE_NOT_CONNECTED');
        }

        const conversation = await prisma.conversation.findFirst({
            where: {
                id: conversationId,
                OR: [
                    { participant1Id: userId },
                    { participant2Id: userId },
                ],
            },
            include: {
                participant1: {
                    select: {
                        id: true,
                        fullName: true,
                        profileImageUrl: true,
                        userType: true,
                    },
                },
                participant2: {
                    select: {
                        id: true,
                        fullName: true,
                        profileImageUrl: true,
                        userType: true,
                    },
                },
                jobPost: {
                    select: {
                        id: true,
                        title: true,
                    },
                },
            },
        });

        if (!conversation) {
            throw new AppError('Konuşma bulunamadı', 404);
        }

        const otherUser = conversation.participant1Id === userId
            ? conversation.participant2
            : conversation.participant1;

        return {
            ...conversation,
            otherUser,
        };
    },

    /**
     * Katılımcılara göre konuşma bul
     */
    async findConversation(user1Id: string, user2Id: string, jobPostId?: string) {
        if (!isDatabaseAvailable) {
            throw new Error('DATABASE_NOT_CONNECTED');
        }

        const conversation = await prisma.conversation.findFirst({
            where: {
                OR: [
                    { participant1Id: user1Id, participant2Id: user2Id },
                    { participant1Id: user2Id, participant2Id: user1Id },
                ],
                ...(jobPostId ? { jobPostId } : {}),
            },
            include: {
                participant1: {
                    select: {
                        id: true,
                        fullName: true,
                        profileImageUrl: true,
                        userType: true,
                    },
                },
                participant2: {
                    select: {
                        id: true,
                        fullName: true,
                        profileImageUrl: true,
                        userType: true,
                    },
                },
                jobPost: {
                    select: {
                        id: true,
                        title: true,
                    },
                },
            },
        });

        if (!conversation) return null;

        const otherUser = conversation.participant1Id === user1Id
            ? conversation.participant2
            : conversation.participant1;

        return {
            ...conversation,
            otherUser,
        };
    },

    /**
     * Konuşma mesajlarını getir
     */
    async getMessages(conversationId: string, userId: string, page = 1, limit = 50) {
        // Erişim kontrolü
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
            throw new AppError('Konuşma bulunamadı veya erişim reddedildi', 404);
        }

        const skip = (page - 1) * limit;

        const [messages, total] = await Promise.all([
            prisma.message.findMany({
                where: {
                    conversationId,
                    isDeleted: false,
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
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
            }),
            prisma.message.count({
                where: {
                    conversationId,
                    isDeleted: false,
                },
            }),
        ]);

        return {
            messages: messages.reverse(), // En eski mesaj önce
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        };
    },
};

export default conversationService;
