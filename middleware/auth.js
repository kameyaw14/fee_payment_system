import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config/env.js';
import School from '../models/School.js';

export const authenticateSchool = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split('Bearer ')[1];
    if (!token) {
      throw new Error('No token provided');
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const school = await School.findById(decoded.id);
    if (!school) {
      throw new Error('School not found');
    }

    req.school = { id: school._id, email: school.email };
    next();
  } catch (error) {
    res.status(401).json({
      success: false,
      message: error.message || 'Unauthorized',
    });
  }
};