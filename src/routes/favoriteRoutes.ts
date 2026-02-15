import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
    getFavorites,
    addFavorite,
    removeFavorite,
    checkFavorite,
} from '../controllers/favoriteController';

const router = Router();

// Tüm route'lar authentication gerektiriyor
router.use(authenticate);

// GET /favorites - Kullanıcının favorilerini getir
router.get('/', getFavorites);

// POST /favorites/:electricianId - Favorilere ekle
router.post('/:electricianId', addFavorite);

// DELETE /favorites/:electricianId - Favorilerden çıkar
router.delete('/:electricianId', removeFavorite);

// GET /favorites/:electricianId/check - Favori mi kontrol et
router.get('/:electricianId/check', checkFavorite);

export default router;
