import { Router } from 'express';
import { submitReview, getElectricianReviews } from '../controllers/reviewController';
import { authenticate } from '../middleware/auth';

const router = Router();

// Submit a review (requires auth)
router.post('/', authenticate, submitReview);

// Get reviews for an electrician (public)
router.get('/electrician/:electricianId', getElectricianReviews);

export default router;
