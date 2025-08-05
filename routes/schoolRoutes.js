// routes/schoolRoutes.js
import express from 'express';
import { register, login } from '../controller/schoolController.js';
import arcjetMiddleware from '../middleware/arcjet.js';

const schoolRouter = express.Router();

schoolRouter.post('/register', arcjetMiddleware, register);
schoolRouter.post('/login', arcjetMiddleware, login);

export default schoolRouter;