import { Router } from 'express';
import {
  handleScheduleEmails,
  handleGetScheduledEmails,
  handleGetSentEmails,
  handleGetQueueStats,
} from '../controllers/emailController.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.use(requireAuth);

router.post('/schedule', handleScheduleEmails);
router.get('/scheduled', handleGetScheduledEmails);
router.get('/sent', handleGetSentEmails);
router.get('/stats', handleGetQueueStats);

export const emailRoutes = router;
