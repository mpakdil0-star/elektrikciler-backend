import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import prisma, { isDatabaseAvailable } from '../config/database';

import {
  getNotificationsByUserId,
  getUnreadCountByUserId,
  markRelatedAsRead,
  markAsReadById,
  markAllAsReadByUserId,
  deleteNotificationById
} from '../services/notificationService';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Get all notifications for the authenticated user
router.get('/', async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const notifications = await getNotificationsByUserId(userId);

    res.json({
      success: true,
      data: {
        notifications,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch notifications',
    });
  }
});

// Get unread count
router.get('/unread-count', async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const count = await getUnreadCountByUserId(userId);

    res.json({
      success: true,
      data: {
        count,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch unread count',
    });
  }
});

// Mark notifications for a specific related item as read
router.put('/related-read', async (req, res) => {
  try {
    const { type, relatedId } = req.body;
    const userId = (req as any).user.id;

    if (!type || !relatedId) {
      return res.status(400).json({
        success: false,
        error: 'Type and relatedId are required'
      });
    }

    await markRelatedAsRead(userId, type, relatedId);

    res.json({
      success: true,
      data: { message: 'Related notifications marked as read' },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to mark related notifications as read',
    });
  }
});

// Mark notification as read
router.put('/:id/read', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user.id;

    await markAsReadById(userId, id);

    res.json({
      success: true,
      data: { message: 'Marked as read' },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to mark as read',
    });
  }
});

// Mark all notifications as read
router.put('/read-all', async (req, res) => {
  try {
    const userId = (req as any).user.id;

    await markAllAsReadByUserId(userId);

    res.json({
      success: true,
      data: { message: 'All marked as read' },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to mark all as read',
    });
  }
});

// Delete notification
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user.id;

    await deleteNotificationById(userId, id);

    res.json({
      success: true,
      data: { message: 'Notification deleted' },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to delete notification',
    });
  }
});


export default router;

