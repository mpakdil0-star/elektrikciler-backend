import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import * as paymentController from '../controllers/paymentController';

const router = Router();

// Tüm ödeme rotaları kimlik doğrulaması gerektirir
router.use(authenticate);

// Kredi Paketlerini Listele
router.get('/packages', paymentController.getCreditPackages);

// Kredi Satın Al
router.post('/purchase', paymentController.purchaseCredits);

// İşlem Geçmişi
router.get('/history', paymentController.getTransactionHistory);

export default router;
