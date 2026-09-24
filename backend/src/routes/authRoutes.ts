import { Router } from 'express';
import {
  initiateGoogleAuth,
  handleGoogleAuthCallback,
  getCurrentUser,
  logoutUser,
} from '../controllers/authController.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/google', initiateGoogleAuth);
router.get('/callback', handleGoogleAuthCallback);
router.get('/me', requireAuth, getCurrentUser);
router.post('/logout', logoutUser);

export const authRoutes = router;
