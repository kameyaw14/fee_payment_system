import express from 'express';
import { authenticateStudent } from '../middleware/auth.js';
import { initializePayment, verifyPayment, handleWebhook } from '../controller/paymentController.js';

const paymentRouter = express.Router();

paymentRouter.post('/initialize', authenticateStudent, initializePayment);
paymentRouter.post('/verify', verifyPayment); // Optional: protect with auth if needed
paymentRouter.post('/webhook', handleWebhook);

export default paymentRouter;