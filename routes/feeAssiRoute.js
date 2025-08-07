import express from 'express';
import { authenticateSchool, authenticateStudent } from '../middleware/auth.js';
import { createFeeAssignment, getStudentFeeAssignments, createFee } from '../controller/feeAssignController.js';

const feeAssignRouter = express.Router();
feeAssignRouter.post('/create', authenticateSchool, createFee)
feeAssignRouter.post('/assign', authenticateSchool, createFeeAssignment);
feeAssignRouter.get('/student', authenticateStudent, getStudentFeeAssignments);

export default feeAssignRouter;