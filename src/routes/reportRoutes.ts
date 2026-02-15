import express from 'express';
import { authenticate, authorize } from '../middleware/auth';
import {
    createReport,
    getMyReports,
    getAllReports,
    updateReportStatus,
    getReportReasons
} from '../controllers/reportController';

const router = express.Router();

// Public
router.get('/reasons', getReportReasons);

// User routes (requires authentication)
router.post('/', authenticate, createReport);
router.get('/my-reports', authenticate, getMyReports);

// Admin routes
router.get('/admin/all', authenticate, authorize('ADMIN'), getAllReports);
router.patch('/admin/:id', authenticate, authorize('ADMIN'), updateReportStatus);

export default router;
