import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { uploadAvatar, uploadAvatarBase64, removeAvatar, getElectricianStats, changePassword, updateProfile, getVerificationStatus, submitVerification, updatePushToken, getElectricians, getElectricianById, deleteAccount } from '../controllers/userController';
import { meController } from '../controllers/authController';
import { getJobHistory } from '../controllers/historyController';
import { getNotificationPreferences, updateNotificationPreferences } from '../controllers/notificationPreferencesController';
import { authenticate, optionalAuthenticate, authorize } from '../middleware/auth';
import { validate, updateProfileValidation, changePasswordValidation, updatePushTokenValidation, updateNotificationPreferencesValidation } from '../validators';

import { blockUserController, unblockUserController, getBlockedUsersController, checkBlockStatusController } from '../controllers/blockController';

const router = express.Router();

import { upload } from '../middleware/upload';

// Routes
router.get('/me', authenticate, meController);
router.post('/avatar', authenticate, upload.single('image'), uploadAvatar);
router.post('/avatar/base64', authenticate, uploadAvatarBase64);
router.delete('/avatar', authenticate, removeAvatar);
router.get('/stats', authenticate, getElectricianStats);
router.put('/password', authenticate, validate(changePasswordValidation), changePassword);
router.put('/profile', authenticate, validate(updateProfileValidation), updateProfile);
router.delete('/', authenticate, deleteAccount);
router.get('/history', authenticate, getJobHistory);

// Verification routes (MYK/Oda belgesi)
router.get('/verification', authenticate, getVerificationStatus);
router.post('/verification', authenticate, submitVerification);

// Notification routes
router.post('/push-token', optionalAuthenticate, validate(updatePushTokenValidation), updatePushToken);
router.get('/notification-preferences', authenticate, getNotificationPreferences);
router.put('/notification-preferences', authenticate, validate(updateNotificationPreferencesValidation), updateNotificationPreferences);

// Block (Engelleme) routes
router.post('/block', authenticate, blockUserController);
router.delete('/block/:userId', authenticate, unblockUserController);
router.get('/blocked', authenticate, getBlockedUsersController);
router.get('/block/:userId/status', authenticate, checkBlockStatusController);

router.get('/electricians', optionalAuthenticate, getElectricians);
router.get('/electricians/:id', optionalAuthenticate, getElectricianById);

// Admin verification management


export default router;

// MYK Verification routes added - v2
