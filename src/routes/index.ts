import { Router } from 'express';
import authRoutes from './authRoutes';
import userRoutes from './userRoutes';
import jobRoutes from './jobRoutes';
import bidRoutes from './bidRoutes';
import conversationRoutes from './conversationRoutes';
import messageRoutes from './messageRoutes';
import notificationRoutes from './notificationRoutes';
import locationRoutes from './locationRoutes';
import favoriteRoutes from './favoriteRoutes';
import paymentRoutes from './paymentRoutes';
import reviewRoutes from './reviewRoutes';
import adminRoutes from './adminRoutes';
import supportRoutes from './supportRoutes';
import legalRoutes from './legalRoutes';
import reportRoutes from './reportRoutes';

const router = Router();

// Debugging: Log all incoming requests to the API router
router.use((req, res, next) => {
  console.log(`📡 [API ROUTER] ${req.method} ${req.url}`);
  next();
});

// Health check
router.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'API is running',
    timestamp: new Date().toISOString()
  });
});

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/jobs', jobRoutes);
router.use('/bids', bidRoutes);
router.use('/conversations', conversationRoutes);
router.use('/messages', messageRoutes);
router.use('/notifications', notificationRoutes);
router.use('/locations', locationRoutes);
router.use('/favorites', favoriteRoutes);
router.use('/payments', paymentRoutes);
router.use('/reviews', reviewRoutes);
router.use('/admin', adminRoutes);
router.use('/legal', legalRoutes);
router.use('/support', supportRoutes);
router.use('/reports', reportRoutes);

export default router;
