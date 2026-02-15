import { Router } from 'express';
import { authenticate } from '../middleware/auth';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Send a message
router.post('/', async (req, res) => {
  try {
    const { receiverId, content, jobId, bidId } = req.body;
    const userId = (req as any).user?.id;

    console.log(`✉️ [MESSAGE] From ${userId} to ${receiverId} - Content: ${content?.substring(0, 20)}...`);

    // Find or create conversation between sender and receiver
    const { mockStore } = require('../utils/mockStore');
    let conversation = mockStore.findConversationByParticipants(userId, receiverId, jobId);

    if (!conversation) {
      // Create new conversation
      // Ensure IDs are consistent regardless of who starts the conversation
      const participants = [userId, receiverId].sort();
      const p1 = participants[0];
      const p2 = participants[1];

      const conversationId = jobId
        ? `mock-conv-${jobId}-${p1}-${p2}`
        : `mock-conv-${p1}-${p2}`;
      conversation = {
        id: conversationId,
        participant1Id: userId,
        participant2Id: receiverId,
        jobPostId: jobId || null,
        bidId: bidId || null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastMessage: null,
        lastMessageAt: null,
      };
      mockStore.saveConversation(conversation);
      console.log(`💬 [MESSAGE] Created new conversation: ${conversationId}`);
    }

    // Create and save message
    const messageData = {
      id: `mock-msg-${Date.now()}`,
      conversationId: conversation.id,
      senderId: userId,
      receiverId: receiverId,
      recipientId: receiverId,
      content: content || '',
      createdAt: new Date().toISOString(),
      isRead: false,
      messageType: 'TEXT'
    };

    mockStore.saveMessage(messageData);
    console.log(`✅ [MESSAGE] Message saved to mockStore`);

    // Send real-time notification
    const { notifyUser } = require('../server');
    notifyUser(receiverId, 'new_message', {
      ...messageData,
      title: 'Yeni Mesaj 💬',
      message: content?.substring(0, 50) + (content?.length > 50 ? '...' : '')
    });

    // Create notification in notification center
    const { saveNotification } = require('../services/notificationService');
    const notification = {
      id: `mock-notif-${Date.now()}-msg`,
      userId: receiverId,
      type: 'MESSAGE_RECEIVED',
      title: 'Yeni Mesaj 💬',
      message: content?.substring(0, 80) + (content?.length > 80 ? '...' : ''),
      isRead: false,
      relatedId: conversation.id,
      relatedType: 'CONVERSATION',
      createdAt: new Date().toISOString()
    };
    saveNotification({
      ...notification,
      userId: receiverId
    });

    // CRITICAL: Send PUSH notification (for background/closed app)
    const { mockStorage } = require('../utils/mockStorage');
    const senderData = mockStorage.get(userId);
    const receiverData = mockStorage.get(receiverId);
    if (receiverData?.pushToken) {
      const pushNotificationService = require('../services/pushNotificationService').default;
      pushNotificationService.sendNotification({
        to: receiverData.pushToken,
        title: `${senderData?.fullName || 'Birisi'} mesaj gönderdi 💬`,
        body: content?.substring(0, 80) + (content?.length > 80 ? '...' : ''),
        data: { conversationId: conversation.id, type: 'new_message' }
      }).catch((err: any) => console.error('Push Notification Error:', err));
    }

    res.json({
      success: true,
      data: {
        message: messageData,
        conversationId: conversation.id
      },
    });
  } catch (error: any) {
    console.error('❌ Failed to send message:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to send message',
    });
  }
});

export default router;

