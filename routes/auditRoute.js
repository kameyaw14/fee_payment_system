import express from 'express';
import { authenticateSchool } from '../middleware/auth.js';
import { getAuditLogs } from '../controller/auditController.js';

const auditRouter = express.Router();


auditRouter.get('/logs', authenticateSchool, getAuditLogs);

export default auditRouter;