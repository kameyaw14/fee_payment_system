// routes/schoolRoutes.js
import express from 'express';
import { register, login, addStudent, getAdminDashboard, checkAuth, sendOtp, resendOtp, verifyOtp } from '../controller/schoolController.js';
import arcjetMiddleware from '../middleware/arcjet.js';
import { authenticateSchool } from '../middleware/auth.js';

const schoolRouter = express.Router();

schoolRouter.post('/register', arcjetMiddleware, register);
schoolRouter.post('/login', arcjetMiddleware, login);
schoolRouter.post('/mfa/send-otp', arcjetMiddleware, authenticateSchool, sendOtp);
schoolRouter.post('/mfa/resend-otp', arcjetMiddleware, authenticateSchool, resendOtp);
schoolRouter.post('/mfa/verify-otp', arcjetMiddleware, verifyOtp);
schoolRouter.get("/check-auth", arcjetMiddleware, authenticateSchool, checkAuth); 
schoolRouter.post('/students/add', arcjetMiddleware, authenticateSchool, addStudent);
schoolRouter.get('/dashboard', arcjetMiddleware, authenticateSchool, getAdminDashboard);

export default schoolRouter;