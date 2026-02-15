import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth';
import conversationService from '../services/conversationService';
import messageService from '../services/messageService';
import prisma, { isDatabaseAvailable } from '../config/database';
import { mockStore } from '../utils/mockStore';

// Mock veriler için yardımcı fonksiyonlar
// Mock veriler için yardımcı fonksiyonlar
const getMockConversations = (userId: string): any[] => {
  const { mockStore: store } = require('../utils/mockStore');
  return store.getConversationsByUserId(userId);
};

const getMockMessages = (convId: string, userId: string): any[] => {
  const { mockStore: store } = require('../utils/mockStore');
  return store.getMessages(convId);
};

const router = Router();

interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    userType: string;
  };
}

// Tüm route'lar authentication gerektiriyor
router.use(authenticate);

// GET /conversations - Kullanıcının tüm konuşmalarını getir
router.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: { message: 'Unauthorized' },
      });
    }

    try {
      // Veritabanı bağlantısı yoksa veya mock kullanıcı ise mock verileri dön
      if (!isDatabaseAvailable || req.user.id.startsWith('mock-')) {
        console.warn('⚠️ Konuşmalar için mock veriler dönülüyor');

        // Get conversations from mockStore first
        const { mockStore: store } = require('../utils/mockStore');
        const storedConversations = store.getConversationsByUserId(req.user.id);

        if (storedConversations.length > 0) {
          console.log(`💬 [CONVERSATIONS] Found ${storedConversations.length} stored conversations for ${req.user.id}`);

          // Enrich conversations with otherUser details
          const { mockStorage: userStorage } = require('../utils/mockStorage');

          const enrichedConversations = storedConversations.map((conv: any) => {
            const otherUserId = conv.participant1Id === req.user!.id ? conv.participant2Id : conv.participant1Id;

            // Determine userType from ID suffix
            let otherUserType = 'CITIZEN';
            if (otherUserId.endsWith('-ELECTRICIAN')) otherUserType = 'ELECTRICIAN';
            else if (otherUserId.endsWith('-ADMIN')) otherUserType = 'ADMIN';

            const otherUserData = userStorage.getFullUser(otherUserId, otherUserType);

            // Get unread count
            // Not: Mock store conversation bazlı tutuyor, gerçekçi olması için lastMessage gonderen ben isem 0 dönmeli
            let unreadCount = store.getUnreadCount(conv.id);
            if (conv.lastMessage?.senderId === req.user!.id) {
              unreadCount = 0;
            }

            return {
              ...conv,
              unreadCount: unreadCount,
              otherUser: {
                id: otherUserData.id,
                fullName: otherUserData.fullName,
                profileImageUrl: otherUserData.profileImageUrl,
                userType: otherUserData.userType
              }
            };
          });

          return res.json({
            success: true,
            data: { conversations: enrichedConversations },
          });
        }

        // Fall back to default mock conversations if none stored
        return res.json({
          success: true,
          data: { conversations: getMockConversations(req.user.id) },
        });
      }

      const conversations = await conversationService.getConversations(req.user.id);
      res.json({
        success: true,
        data: { conversations },
      });
    } catch (dbError: any) {
      // Database bağlantısı yoksa mock liste döndür
      console.warn('Database error, returning mock conversations:', dbError.message);

      // Try mockStore first
      const { mockStore: store } = require('../utils/mockStore');
      const storedConversations = store.getConversationsByUserId(req.user.id);

      if (storedConversations.length > 0) {
        return res.json({
          success: true,
          data: { conversations: storedConversations },
        });
      }

      res.json({
        success: true,
        data: { conversations: getMockConversations(req.user.id) },
      });
    }
  } catch (error: any) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        error: { message: error.message },
      });
    }
    next(error);
  }
});

// POST /conversations - Yeni konuşma başlat
router.post('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: { message: 'Unauthorized' },
      });
    }

    const { recipientId, jobPostId } = req.body;

    if (!recipientId) {
      return res.status(400).json({
        success: false,
        error: { message: 'Alıcı ID gereklidir' },
      });
    }

    try {
      if (!isDatabaseAvailable || req.user.id.startsWith('mock-') || recipientId.startsWith('mock-')) {
        const { mockStore } = require('../utils/mockStore');
        const userId = req.user.id;

        // Find existing conversation
        let conversation = mockStore.findConversationByParticipants(userId, recipientId, jobPostId);

        if (!conversation) {
          // Create new with consistent ID format
          const participants = [userId, recipientId].sort();
          const p1 = participants[0];
          const p2 = participants[1];
          const conversationId = jobPostId
            ? `mock-conv-${jobPostId}-${p1}-${p2}`
            : `mock-conv-${p1}-${p2}`;

          conversation = {
            id: conversationId,
            participant1Id: userId,
            participant2Id: recipientId,
            jobPostId: jobPostId || null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            lastMessage: null,
            lastMessageAt: null,
          };
          mockStore.saveConversation(conversation);
        }

        return res.status(201).json({
          success: true,
          data: { conversation },
        });
      }

      const conversation = await conversationService.getOrCreateConversation(
        req.user.id,
        recipientId,
        jobPostId
      );

      res.status(201).json({
        success: true,
        data: { conversation },
      });
    } catch (dbError: any) {
      // Database bağlantısı yoksa mock döndür
      console.warn('Database error, returning mock conversation:', dbError.message);
      const mockConv = getMockConversations(req.user.id)[0];
      res.status(201).json({
        success: true,
        data: { conversation: mockConv },
      });
    }
  } catch (error: any) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        error: { message: error.message },
      });
    }
    next(error);
  }
});

// GET /conversations/find - Katılımcılara göre konuşma bul
router.get('/find', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: { message: 'Unauthorized' },
      });
    }

    const { recipientId, electricianId, jobPostId, jobId } = req.query;
    const targetUserId = (recipientId || electricianId) as string;
    const targetJobId = (jobPostId || jobId) as string;

    if (!targetUserId) {
      return res.status(400).json({
        success: false,
        error: { message: 'Recipient ID required' },
      });
    }

    try {
      if (!isDatabaseAvailable || req.user.id.startsWith('mock-') || targetUserId.startsWith('mock-')) {
        const { mockStore } = require('../utils/mockStore');
        const userId = req.user.id;

        // Find existing conversation in mock store
        const conversation = mockStore.findConversationByParticipants(userId, targetUserId, targetJobId);

        if (!conversation) {
          return res.json({
            success: true,
            data: { conversation: null },
          });
        }

        return res.json({
          success: true,
          data: { conversation },
        });
      }

      // Real DB lookup
      // Note: We might need to implement findConversation in conversationService if not exists
      // For now, we'll iterate or use getOrCreate logic but purely for finding
      // Efficient way: use existing getOrCreate but only if it doesn't create? 
      // Start with service check.
      const conversation = await conversationService.findConversation(req.user.id, targetUserId, targetJobId);

      if (!conversation) {
        return res.json({
          success: true,
          data: { conversation: null },
        });
      }

      res.json({
        success: true,
        data: { conversation },
      });

    } catch (dbError: any) {
      console.warn('Database error in find, returning 404:', dbError.message);
      return res.status(404).json({
        success: false,
        error: { message: 'Conversation not found (DB Error)' },
      });
    }
  } catch (error: any) {
    next(error);
  }
});

// GET /conversations/:id - Tek bir konuşmayı getir
router.get('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: { message: 'Unauthorized' },
      });
    }

    const { id } = req.params;

    try {
      if (!isDatabaseAvailable || req.user.id.startsWith('mock-') || id.startsWith('mock-')) {
        const { mockStore } = require('../utils/mockStore');
        const { mockStorage: userStorage } = require('../utils/mockStorage');

        // 1. Check for existence or reconstruct if it's a valid pattern
        const conv = mockStore.getOrReconstruct(id, req.user.id);

        if (!conv) {
          return res.status(404).json({
            success: false,
            error: { message: 'Konuşma bulunamadı' }
          });
        }

        // 2. Security Check (Lenient in mock mode)
        if (!mockStore.isParticipant(id, req.user.id)) {
          return res.status(403).json({
            success: false,
            error: { message: 'Bu konuşmaya erişim izniniz yok' }
          });
        }

        const otherUserId = conv.participant1Id === req.user.id ? conv.participant2Id : conv.participant1Id;
        const otherUser = userStorage.get(otherUserId);

        return res.json({
          success: true,
          data: {
            conversation: {
              ...conv,
              otherUser
            }
          },
        });
      }

      const conversation = await conversationService.getConversation(id, req.user.id);
      res.json({
        success: true,
        data: { conversation },
      });
    } catch (error: any) {
      // Veritabanı hatası veya bulunamadıysa mock veriye düş
      console.warn('⚠️ Conversation fetch error, falling back to mock:', error.message);
      const mockConvs = getMockConversations(req.user.id);
      const baseConv = mockConvs[0] || { id: 'fallback', otherUser: { fullName: 'Kullanıcı' } };
      const conv = JSON.parse(JSON.stringify(baseConv));
      conv.id = id;

      return res.json({
        success: true,
        data: { conversation: conv },
      });
    }
  } catch (error: any) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        error: { message: error.message },
      });
    }
    next(error);
  }
});

// GET /conversations/:id/messages - Konuşma mesajlarını getir
router.get('/:id/messages', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: { message: 'Unauthorized' },
      });
    }

    const { id } = req.params;
    const { page = 1, limit = 50 } = req.query;

    try {
      if (!isDatabaseAvailable || req.user.id.startsWith('mock-') || id.startsWith('mock-')) {
        const { mockStore: store } = require('../utils/mockStore');

        // Check for existence or reconstruct if valid pattern
        const conv = store.getOrReconstruct(id, req.user.id);

        if (!conv) {
          return res.status(404).json({
            success: false,
            error: { message: 'Konuşma bulunamadı' }
          });
        }

        // Security Check
        if (!store.isParticipant(id, req.user.id)) {
          return res.status(403).json({
            success: false,
            error: { message: 'Bu mesajlara erişim izniniz yok' }
          });
        }

        const storedMessages = store.getMessages(id);

        if (storedMessages.length > 0) {
          console.log(`✉️ [MESSAGES] Found ${storedMessages.length} stored messages for conversation: ${id}`);
          return res.json({
            success: true,
            data: {
              messages: storedMessages,
              pagination: {
                page: 1,
                limit: 50,
                total: storedMessages.length,
                totalPages: 1
              }
            },
          });
        }

        // Fall back to default mock messages
        const mockMessages = getMockMessages(id, req.user.id);
        return res.json({
          success: true,
          data: {
            messages: mockMessages,
            pagination: {
              page: 1,
              limit: 50,
              total: mockMessages.length,
              totalPages: 1
            }
          },
        });
      }

      const result = await conversationService.getMessages(
        id,
        req.user.id,
        parseInt(page as string),
        parseInt(limit as string)
      );

      res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      const isConnectionError = error.message?.includes('connect') || error.code === 'P1001';

      if (isConnectionError || id.startsWith('mock-')) {
        //  Try mockStore first
        const { mockStore: store } = require('../utils/mockStore');
        const storedMessages = store.getMessages(id);

        if (storedMessages.length > 0) {
          return res.json({
            success: true,
            data: {
              messages: storedMessages,
              pagination: {
                page: 1,
                limit: 50,
                total: storedMessages.length,
                totalPages: 1
              }
            },
          });
        }

        const mockMessages = getMockMessages(id, req.user.id);
        return res.json({
          success: true,
          data: {
            messages: mockMessages,
            pagination: {
              page: 1,
              limit: 50,
              total: mockMessages.length,
              totalPages: 1
            }
          },
        });
      }
      throw error;
    }
  } catch (error: any) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        error: { message: error.message },
      });
    }
    next(error);
  }
});

// POST /conversations/:id/messages - Mesaj gönder (HTTP fallback)
router.post('/:id/messages', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: { message: 'Unauthorized' },
      });
    }

    const { id } = req.params;
    const { content, messageType = 'TEXT' } = req.body;

    if (!content) {
      return res.status(400).json({
        success: false,
        error: { message: 'Mesaj içeriği gereklidir' },
      });
    }

    try {
      if (!isDatabaseAvailable || req.user.id.startsWith('mock-') || id.startsWith('mock-')) {
        const { mockStore } = require('../utils/mockStore');

        const messageData = {
          id: `mock-msg-${Date.now()}`,
          conversationId: id,
          senderId: req.user.id,
          receiverId: 'mock-recipient', // conversation'dan bulunmalı ama şimdilik simple
          recipientId: 'mock-recipient',
          content,
          messageType,
          isRead: false,
          createdAt: new Date().toISOString(),
          sender: { id: req.user.id, fullName: 'Siz', profileImageUrl: null }
        };

        // Find conversation to get real receiverId
        const conversation = mockStore.getOrReconstruct(id, req.user.id);
        if (conversation) {
          const receiverId = conversation.participant1Id === req.user.id ? conversation.participant2Id : conversation.participant1Id;
          messageData.receiverId = receiverId;
          messageData.recipientId = receiverId;

          // Send socket notification
          const { notifyUser } = require('../server');
          notifyUser(receiverId, 'new_message', {
            ...messageData,
            title: 'Yeni Mesaj 💬',
            message: content?.substring(0, 50) + (content?.length > 50 ? '...' : '')
          });
        }

        mockStore.saveMessage(messageData);
        console.log(`✅ [MESSAGE] HTTP Fallback: Message saved to mockStore for conv: ${id}`);

        return res.status(201).json({
          success: true,
          data: { message: messageData },
        });
      }

      const message = await messageService.sendMessage(id, req.user.id, content, messageType);

      res.status(201).json({
        success: true,
        data: { message },
      });
    } catch (error: any) {
      const isConnectionError = error.message?.includes('connect') || error.code === 'P1001';
      if (isConnectionError) {
        const mockMsg = {
          id: `mock-sent-${Date.now()}`,
          conversationId: id,
          senderId: req.user.id,
          recipientId: 'mock-recipient',
          content,
          messageType,
          isRead: false,
          createdAt: new Date().toISOString(),
          sender: { id: req.user.id, fullName: 'Siz', profileImageUrl: null }
        };
        return res.status(201).json({
          success: true,
          data: { message: mockMsg },
        });
      }
      throw error;
    }
  } catch (error: any) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        error: { message: error.message },
      });
    }
    next(error);
  }
});

// PUT /conversations/:id/read - Mesajları okundu olarak işaretle
router.put('/:id/read', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: { message: 'Unauthorized' },
      });
    }

    try {
      const { id } = req.params;

      if (!isDatabaseAvailable || req.user.id.startsWith('mock-') || id.startsWith('mock-')) {
        mockStore.clearUnreadCount(id);

        // Bildirimleri de temizle
        const { clearMockNotificationsByRelatedId } = require('./notificationRoutes');
        clearMockNotificationsByRelatedId(req.user.id, 'new_message', id);

        return res.json({
          success: true,
          message: 'Mesajlar okundu olarak işaretlendi (Mock)',
        });
      }

      await messageService.markAsRead(id, req.user.id);

      // Bildirimleri de temizle
      await prisma.notification.updateMany({
        where: {
          userId: req.user.id,
          relatedId: id,
          type: 'new_message',
          isRead: false
        },
        data: { isRead: true }
      });

      res.json({
        success: true,
        message: 'Mesajlar okundu olarak işaretlendi',
      });
    } catch (error: any) {
      const isConnectionError = error.message?.includes('connect') || error.code === 'P1001';
      if (isConnectionError) {
        mockStore.clearUnreadCount(req.params.id);
        return res.json({
          success: true,
          message: 'Mesajlar okundu olarak işaretlendi (Mock)',
        });
      }
      throw error;
    }
  } catch (error: any) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        error: { message: error.message },
      });
    }
    next(error);
  }
});

export default router;
