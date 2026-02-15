import { Router } from 'express';
import { getLocations, addLocation, updateLocation, deleteLocation } from '../controllers/locationController';
import { authenticate, optionalAuthenticate } from '../middleware/auth';

const router = Router();

router.get('/', optionalAuthenticate, getLocations);
router.post('/', authenticate, addLocation);
router.put('/:id', authenticate, updateLocation);
router.delete('/:id', authenticate, deleteLocation);

export default router;
