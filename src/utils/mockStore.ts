const mockUnreadCounts = new Map<string, number>();
const mockConversations = new Map<string, any>();
const mockMessages = new Map<string, any[]>();

// Initialize with some default data
const CITIZEN_DEMO_ID = 'mock-user-demo-vatandas-com-CITIZEN';
const ELECTRICIAN_DEMO_ID = 'mock-user-demo-usta-com-ELECTRICIAN';
const DEMO_CONV_ID = `mock-conv-demo-${CITIZEN_DEMO_ID}-${ELECTRICIAN_DEMO_ID}`;

mockUnreadCounts.set(DEMO_CONV_ID, 1);
mockConversations.set(DEMO_CONV_ID, {
    id: DEMO_CONV_ID,
    participant1Id: CITIZEN_DEMO_ID,
    participant2Id: ELECTRICIAN_DEMO_ID,
    jobPostId: 'mock-job-1',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastMessage: {
        id: 'mock-msg-init',
        conversationId: DEMO_CONV_ID,
        senderId: ELECTRICIAN_DEMO_ID,
        content: 'Merhaba, iş detaylarını konuşabilir miyiz?',
        createdAt: new Date().toISOString()
    }
});

export const mockStore = {
    // Unread count management
    getUnreadCount: (convId: string) => mockUnreadCounts.get(convId) ?? 0,
    setUnreadCount: (convId: string, count: number) => mockUnreadCounts.set(convId, count),
    clearUnreadCount: (convId: string) => mockUnreadCounts.set(convId, 0),

    // Conversation management
    saveConversation: (conversation: any) => {
        mockConversations.set(conversation.id, conversation);
        console.log(`💬 [MOCK STORE] Saved conversation: ${conversation.id}`);
        return conversation;
    },

    getConversation: (convId: string) => {
        return mockConversations.get(convId) || null;
    },

    getOrReconstruct: (convId: string, userId: string): any => {
        let conv = mockConversations.get(convId);
        if (!conv && convId.startsWith('mock-conv-') && convId.includes(userId)) {
            const participants = mockStore.getParticipantsFromId(convId);
            conv = {
                id: convId,
                participant1Id: participants[0] || userId,
                participant2Id: participants[1] || 'mock-recipient',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                lastMessage: null,
                lastMessageAt: null,
            };
            mockStore.saveConversation(conv);
        }
        return conv || null;
    },

    getConversationsByUserId: (userId: string) => {
        const userConvs: any[] = [];
        mockConversations.forEach((conv) => {
            if (conv.participant1Id === userId || conv.participant2Id === userId) {
                userConvs.push(conv);
            }
        });
        return userConvs;
    },

    findConversationByParticipants: (userId1: string, userId2: string, jobPostId?: string) => {
        let found: any = null;
        mockConversations.forEach((conv) => {
            if (
                ((conv.participant1Id === userId1 && conv.participant2Id === userId2) ||
                    (conv.participant1Id === userId2 && conv.participant2Id === userId1)) &&
                (!jobPostId || conv.jobPostId === jobPostId)
            ) {
                found = conv;
            }
        });
        return found;
    },

    isParticipant: (convId: string, userId: string) => {
        const conv = mockConversations.get(convId);
        if (conv) {
            return conv.participant1Id === userId || conv.participant2Id === userId;
        }

        // Use robust parser for fallback
        const participants = mockStore.getParticipantsFromId(convId);
        return participants.includes(userId);
    },

    getParticipantsFromId: (convId: string): string[] => {
        const conv = mockConversations.get(convId);
        if (conv) {
            return [conv.participant1Id, conv.participant2Id];
        }

        if (convId.startsWith('mock-conv-')) {
            // Robust extraction: Split by 'mock-user-' and take last two parts
            const parts = convId.split('mock-user-');
            if (parts.length >= 3) {
                let p2 = 'mock-user-' + parts[parts.length - 1];
                let p1 = 'mock-user-' + parts[parts.length - 2];

                // Remove trailing hyphen if p1 was followed by mock-user-
                if (p1.endsWith('-')) p1 = p1.slice(0, -1);

                return [p1, p2];
            }
        }
        return [];
    },

    getOtherParticipant: (convId: string, userId: string): string => {
        const participants = mockStore.getParticipantsFromId(convId);
        return participants.find(p => p !== userId) || 'mock-recipient';
    },

    // Message management
    saveMessage: (message: any) => {
        const convId = message.conversationId;
        if (!mockMessages.has(convId)) {
            mockMessages.set(convId, []);
        }
        const messages = mockMessages.get(convId)!;
        messages.push(message);
        console.log(`✉️ [MOCK STORE] Saved message to conversation: ${convId}`);

        // Update conversation's lastMessage
        const conversation = mockConversations.get(convId);
        if (conversation) {
            conversation.lastMessage = message;
            conversation.lastMessageAt = message.createdAt;
            conversation.updatedAt = message.createdAt;

            // Increment unread count for receiver
            const currentUnread = mockUnreadCounts.get(convId) ?? 0;
            mockUnreadCounts.set(convId, currentUnread + 1);
        }

        return message;
    },

    getMessages: (convId: string) => {
        return mockMessages.get(convId) || [];
    },

    getAllConversations: () => {
        const all: any[] = [];
        mockConversations.forEach((conv) => all.push(conv));
        return all;
    },

    getAllMessages: () => {
        const all: any[] = [];
        mockMessages.forEach((msgs) => all.push(...msgs));
        return all;
    }
};
