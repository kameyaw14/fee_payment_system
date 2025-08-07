import express from 'express';
import { authenticateStudent } from '../middleware/auth.js';
import { initializePayment, verifyPayment, handleWebhook } from '../controller/paymentController.js';
import arcjetStudentMiddleware from '../middleware/arcjetStudent.js';

const paymentRouter = express.Router();

paymentRouter.post('/initialize', arcjetStudentMiddleware,authenticateStudent, initializePayment);
paymentRouter.post('/verify', arcjetStudentMiddleware,verifyPayment); // Optional: protect with auth if needed
paymentRouter.post('/webhook', arcjetStudentMiddleware,handleWebhook);

export default paymentRouter;