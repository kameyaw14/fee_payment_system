import FeeAssignmentModel from '../models/feeAssignmentModel.js';
import FeeModel from '../models/Fee.js';
import StudentModel from '../models/Student.js';
import TransactionLogModel from '../models/TransactionLog.js';
import { logActionUtil } from './auditController.js';

// Create Fee (admin-only)
export const createFee = async (req, res) => {
  try {
    const { feeType, amount, dueDate, academicSession, allowPartialPayment, description } = req.body;
    const schoolId = req.user.id; // From authenticateSchool middleware

    // Validate input
    if (!feeType || !amount || !dueDate || !academicSession) {
      return res.status(400).json({ message: 'feeType, amount, dueDate, and academicSession are required' });
    }
    if (amount < 0) {
      return res.status(400).json({ message: 'Amount must be non-negative' });
    }
    if (new Date(dueDate) <= new Date()) {
      return res.status(400).json({ message: 'Due date must be in the future' });
    }

    // Create fee
    const fee = new FeeModel({
      schoolId,
      feeType,
      amount,
      dueDate,
      academicSession,
      allowPartialPayment: allowPartialPayment ?? true,
      description,
    });

    await fee.save();

    // Log to TransactionLog
    await TransactionLogModel.create({
      schoolId,
      action: 'fee_created',
      metadata: {
        ip: req.ip,
        deviceInfo: req.headers['user-agent'],
        adminId: schoolId,
        feeId: fee._id,
        feeType,
        amount,
        academicSession,
      },
    });

    // Log to AuditLog
    await logActionUtil({
      entityType: 'Fee',
      entityId: fee._id,
      action: 'fee_created',
      actor: schoolId,
      actorType: 'admin',
      metadata: {
        ip: req.ip,
        deviceInfo: req.headers['user-agent'],
        adminId: schoolId,
        feeType,
        amount,
        academicSession,
      },
    });

    res.status(201).json({ message: 'Fee created successfully', fee });
  } catch (error) {
    console.error('Error creating fee:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Create Fee Assignment (admin-only)
export const createFeeAssignment = async (req, res) => {
  try {
    const { feeId, studentId, department, yearOfStudy, dueDate } = req.body;
    const adminId = req.user.id; // From authenticateSchool middleware

    // Validate fee
    const fee = await FeeModel.findById(feeId);
    if (!fee) {
      return res.status(404).json({ message: 'Fee not found' });
    }
    if (fee.schoolId !== adminId) {
      return res.status(403).json({ message: 'Unauthorized: Fee does not belong to this school' });
    }

    // Validate dueDate
    if (!dueDate || new Date(dueDate) <= new Date()) {
      return res.status(400).json({ message: 'Valid due date in the future is required' });
    }

    const assignments = [];

    if (studentId) {
      // Individual student assignment
      const student = await StudentModel.findById(studentId);
      if (!student || student.schoolId.toString() !== adminId) {
        return res.status(404).json({ message: 'Student not found or not in this school' });
      }

      const assignment = new FeeAssignmentModel({
        feeId,
        schoolId: fee.schoolId,
        studentId,
        dueDate,
        amountDue: fee.amount,
        status: 'assigned',
      });

      await assignment.save();
      assignments.push(assignment);

      // Log to TransactionLog
      await TransactionLogModel.create({
        schoolId: fee.schoolId,
        action: 'fee_assigned',
        metadata: {
          ip: req.ip,
          deviceInfo: req.headers['user-agent'],
          adminId,
          feeId,
          studentId,
        },
      });

      // Log to AuditLog
      await logActionUtil({
        entityType: 'FeeAssignment',
        entityId: assignment._id,
        action: 'fee_assigned',
        actor: adminId,
        actorType: 'admin',
        metadata: {
          ip: req.ip,
          deviceInfo: req.headers['user-agent'],
          adminId,
          feeId,
          studentId,
        },
      });
    } else if (department || yearOfStudy) {
      // Group assignment
      const query = { schoolId: fee.schoolId };
      if (department) query.department = department;
      if (yearOfStudy) query.yearOfStudy = yearOfStudy;

      const students = await StudentModel.find(query);
      if (students.length === 0) {
        return res.status(404).json({ message: 'No students found for the given criteria' });
      }

      for (const student of students) {
        const assignment = new FeeAssignmentModel({
          feeId,
          schoolId: fee.schoolId,
          studentId: student._id,
          groupCriteria: { department, yearOfStudy },
          dueDate,
          amountDue: fee.amount,
          status: 'assigned',
        });

        await assignment.save();
        assignments.push(assignment);

        // Log to TransactionLog
        await TransactionLogModel.create({
          schoolId: fee.schoolId,
          action: 'fee_assigned',
          metadata: {
            ip: req.ip,
            deviceInfo: req.headers['user-agent'],
            adminId,
            feeId,
            studentId: student._id,
            department,
            yearOfStudy,
          },
        });

        // Log to AuditLog
        await logActionUtil({
          entityType: 'FeeAssignment',
          entityId: assignment._id,
          action: 'fee_assigned',
          actor: adminId,
          actorType: 'admin',
          metadata: {
            ip: req.ip,
            deviceInfo: req.headers['user-agent'],
            adminId,
            feeId,
            studentId: student._id,
            department,
            yearOfStudy,
          },
        });
      }
    } else {
      return res.status(400).json({ message: 'Either studentId or groupCriteria (department/yearOfStudy) must be provided' });
    }

    res.status(201).json({ message: 'Fee assignment created successfully', assignments });
  } catch (error) {
    console.error('Error creating fee assignment:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Get Fee Assignments for a Student (student-only)
export const getStudentFeeAssignments = async (req, res) => {
  try {
    const studentId = req.user.id; // From authenticateStudent middleware

    const assignments = await FeeAssignmentModel.find({ studentId })
      .populate('feeId')
      .populate('schoolId');

    res.status(200).json({ message: 'Fee assignments retrieved successfully', assignments });
  } catch (error) {
    console.error('Error retrieving fee assignments:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Update Fee Assignment Status (called by system after payment confirmation)
export const updateFeeAssignmentStatus = async ({ paymentId }) => {
  try {
    const payment = await PaymentModel.findById(paymentId).populate('feeId');
    if (!payment || payment.status !== 'confirmed') {
      throw new Error('Payment not found or not confirmed');
    }

    const assignment = await FeeAssignmentModel.findOne({
      feeId: payment.feeId,
      studentId: payment.studentId,
    });

    if (!assignment) {
      throw new Error('Fee assignment not found');
    }

    assignment.amountPaid += payment.amount;
    assignment.status = assignment.amountPaid >= assignment.amountDue ? 'fully_paid' : 'partially_paid';
    await assignment.save();

    // Log to TransactionLog
    await TransactionLogModel.create({
      paymentId,
      schoolId: payment.schoolId,
      action: 'fee_assignment_updated',
      metadata: {
        studentId: payment.studentId,
        feeId: payment.feeId,
        amountPaid: assignment.amountPaid,
        status: assignment.status,
      },
    });

    // Log to AuditLog (system action)
    await logActionUtil({
      entityType: 'FeeAssignment',
      entityId: assignment._id,
      action: 'fee_assignment_updated',
      actor: null,
      actorType: 'system',
      metadata: {
        studentId: payment.studentId,
        feeId: payment.feeId,
        amountPaid: assignment.amountPaid,
        status: assignment.status,
      },
    });

    return assignment;
  } catch (error) {
    console.error('Error updating fee assignment status:', error);
    throw error;
  }
};