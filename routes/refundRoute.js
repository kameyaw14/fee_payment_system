import express from 'express';
import { authenticateStudent, authenticateSchool } from '../middleware/auth.js';
import { requestRefund, reviewRefund, handleRefundWebhook } from '../controller/refundController.js';

const refundRouter = express.Router();

refundRouter.post('/request', authenticateStudent, requestRefund);
refundRouter.post('/review', authenticateSchool, reviewRefund);
refundRouter.post('/webhook', handleRefundWebhook);

export default refundRouter;