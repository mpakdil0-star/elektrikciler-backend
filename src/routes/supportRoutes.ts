import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { createTicket, getMyTickets, getTicketDetail, getAllTickets, updateTicketStatus, addTicketMessage } from '../controllers/supportController';

const router = Router();

router.use(authenticate);

// Pro-tip: Specific routes before parameter routes
router.get('/admin/all', getAllTickets); // Place before :id
router.get('/', getMyTickets);
router.put('/:id/status', updateTicketStatus);
router.post('/:id/message', addTicketMessage);
router.get('/:id', getTicketDetail);
router.post('/', createTicket);

export default router;
