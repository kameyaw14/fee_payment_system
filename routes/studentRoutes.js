import express from 'express';
import { login } from '../controller/studentController.js';
import arcjetStudentMiddleware from '../middleware/arcjetStudent.js';

const studentRouter = express.Router();

studentRouter.post('/login', arcjetStudentMiddleware, login);

export default studentRouter;