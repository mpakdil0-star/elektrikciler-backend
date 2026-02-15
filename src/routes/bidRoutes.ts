import { Router } from 'express';
import {
  createBidController,
  getBidByIdController,
  getJobBidsController,
  getMyBidsController,
  updateBidController,
  acceptBidController,
  rejectBidController,
  withdrawBidController,
  deleteBidController,
} from '../controllers/bidController';
import { authenticate } from '../middleware/auth';
import { validate, createBidValidation, updateBidValidation } from '../validators';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Bid routes
router.post('/', validate(createBidValidation), createBidController);
router.get('/my-bids', getMyBidsController);
// IMPORTANT: /job/:jobId must come BEFORE /:id to avoid route conflict
router.get('/job/:jobId', getJobBidsController);
router.get('/:id', getBidByIdController);
router.put('/:id', validate(updateBidValidation), updateBidController);
router.post('/:id/accept', acceptBidController);
router.post('/:id/reject', rejectBidController);
router.post('/:id/withdraw', withdrawBidController);
router.delete('/:id', deleteBidController);

export default router;

