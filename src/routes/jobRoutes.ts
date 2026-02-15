import { Router } from 'express';
import {
  createJobController,
  getJobByIdController,
  getJobsController,
  getMyJobsController,
  updateJobController,
  deleteJobController,
  cancelJobController,
  markJobCompleteController,
  confirmJobCompleteController,
  createReviewController,
  completeJobController,
} from '../controllers/jobController';
import { getJobBidsController } from '../controllers/bidController';
import { authenticate, optionalAuthenticate } from '../middleware/auth';
import { validate, createJobValidation, updateJobValidation, cancelJobValidation, createReviewValidation } from '../validators';

const router = Router();

// Public routes - authentication optional (herkes açık ilanları görebilir)
router.get('/', optionalAuthenticate, getJobsController);
// Bids route'u daha spesifik olduğu için önce tanımlanmalı
router.get('/:jobId/bids', optionalAuthenticate, getJobBidsController); // Bids listesi public
// IMPORTANT: /my-jobs must come BEFORE /:id to avoid route conflict
router.get('/my-jobs', authenticate, getMyJobsController);
router.get('/:id', optionalAuthenticate, getJobByIdController);

// Protected routes - authentication required
router.use(authenticate);

router.post('/', validate(createJobValidation), createJobController);
router.put('/:id', validate(updateJobValidation), updateJobController);
router.delete('/:id', deleteJobController);

// Yeni endpoint'ler - İlan İptali, Tamamlama, Değerlendirme
router.post('/:id/cancel', validate(cancelJobValidation), cancelJobController);
router.post('/:id/mark-complete', markJobCompleteController);
router.post('/:id/confirm-complete', confirmJobCompleteController);
router.post('/:id/complete', completeJobController);
router.post('/:id/review', validate(createReviewValidation), createReviewController);

console.log('✅ Job routes loaded: cancel, mark-complete, confirm-complete, review');

export default router;
