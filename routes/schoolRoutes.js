// routes/schoolRoutes.js
import express from 'express';
import { register, login, addStudent } from '../controller/schoolController.js';
import arcjetMiddleware from '../middleware/arcjet.js';
import { authenticateSchool } from '../middleware/auth.js';

const schoolRouter = express.Router();

schoolRouter.post('/register', arcjetMiddleware, register);
schoolRouter.post('/login', arcjetMiddleware, login);
schoolRouter.post('/students/add', arcjetMiddleware, authenticateSchool, addStudent);

export default schoolRouter;