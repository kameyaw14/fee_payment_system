import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import validator from "validator";
import Student from "../models/Student.js";
import TransactionLog from "../models/TransactionLog.js";
import Notification from "../models/Notification.js";
import StudentRefreshToken from "../models/StudentRefreshToken.js";
import {
  sendStudentLoginSuccessEmail,
  sendFailedLoginEmail,
} from "../utils/email.js";
import {
  STUDENT_JWT_SECRET,
  STUDENT_JWT_REFRESH_SECRET,
  JWT_EXPIRES_IN,
  MAX_LOGIN_ATTEMPTS,
} from "../config/env.js";

export const login = async (req, res) => {
  let session = null;
  try {
    session = await mongoose.startSession();
    session.startTransaction();

    const { email, password } = req.body;
    console.log("Student login attempt:", {
      event: "student_login_attempt",
      email,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
      timestamp: new Date().toISOString(),
    });

    const missingFields = [];
    if (!email) missingFields.push("email");
    if (!password) missingFields.push("password");
    if (missingFields.length > 0) {
      throw new Error(`Missing required fields: ${missingFields.join(", ")}`);
    }

    if (!validator.isEmail(email)) {
      throw new Error("Invalid email format");
    }

    // Check for login lockout
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const failedAttempts = await TransactionLog.countDocuments({
      action: "student_login_failure",
      "metadata.ip": req.ip,
      createdAt: { $gte: oneHourAgo },
    }).session(session);
    if (failedAttempts >= MAX_LOGIN_ATTEMPTS) {
      throw new Error("Too many failed login attempts. Please try again later.");
    }

    // Find student
    const student = await Student.findOne({ email }).session(session);
    if (!student) {
      await logFailedLogin(email, req.ip, req.headers["user-agent"], null, null, failedAttempts + 1, session);
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    // Verify password
    const isMatch = await bcrypt.compare(password, student.password);
    if (!isMatch) {
        console.log("70")
      await logFailedLogin(
        email,
        req.ip,
        req.headers["user-agent"],
        student._id,
        student.schoolId,
        failedAttempts + 1,
        session
      );
        console.log("80")
      try {
        console.log("Sending login failure notification...");
        await sendFailedLoginEmail(student, req.ip, new Date());
        await new Notification({
          recipient: student.email,
          type: "login_failure",
          message: `Failed login attempt for ${student.email}`,
          schoolId: student.schoolId,
          studentId: student._id,
          status: "sent",
          sentAt: new Date(),
        }).save({ session });
      } catch (notificationError) {
        console.error("Non-critical error (notification/email):", {
          event: "notification_failure",
          error: notificationError.message,
          timestamp: new Date().toISOString(),
        });
        console.log("Sending notification failure transaction log...");
        await new TransactionLog({
          studentId: student._id,
          schoolId: student.schoolId,
          action: "notification_failure",
          metadata: {
            ip: req.ip,
            deviceId: req.headers["user-agent"],
            error: notificationError.message,
          },
        }).save({ session });
        console.log("Sent notification failure transaction log.");
      }
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    // Generate JWT and refresh token
    const token = jwt.sign(
      {
        id: student._id,
        email: student.email,
        schoolId: student.schoolId,
        studentId: student.studentId,
      },
      STUDENT_JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );
    const refreshToken = jwt.sign(
      { id: student._id },
      STUDENT_JWT_REFRESH_SECRET,
      {
        expiresIn: "7d",
      }
    );

    // Save refresh token
    const refreshTokenDoc = new StudentRefreshToken({
      studentId: student._id,
      token: refreshToken,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
    await refreshTokenDoc.save({ session });

    // Log successful login
    console.log("Sending successful login transaction log...");
    await new TransactionLog({
      schoolId: student.schoolId,
      studentId: student._id,
      action: "student_login_success",
      metadata: {
        ip: req.ip,
        deviceId: req.headers["user-agent"],
        fraudScore: 0,
      },
    }).save({ session });
    console.log("Sent successful login transaction log.");

    // Send success notification
    try {
      console.log("Sending login success notification...");
      await sendStudentLoginSuccessEmail(student);
      await new Notification({
        recipient: student.email,
        type: "student_login_success",
        message: `Successful login for ${student.name}`,
        schoolId: student.schoolId,
        studentId: student._id,
        status: "sent",
        sentAt: new Date(),
      }).save({ session });
      console.log("Sent login success notification.");
    } catch (notificationError) {
      console.error("Non-critical error (notification/email):", {
        event: "notification_failure",
        error: notificationError.message,
        timestamp: new Date().toISOString(),
      });
      console.log("Sending notification failure transaction log...");
      await new TransactionLog({
        studentId: student._id,
        schoolId: student.schoolId,
        action: "notification_failure",
        metadata: {
          ip: req.ip,
          deviceId: req.headers["user-agent"],
          error: notificationError.message,
        },
      }).save({ session });
      console.log("Sent notification failure transaction log.");
    }

    await session.commitTransaction();

    // Increment Prometheus counter (uncomment when set up)
    // prometheus.register.getSingleMetric('student_logins_total').inc();

    res.status(200).json({
      success: true,
      data: {
        _id: student._id,
        name: student.name,
        email: student.email,
        studentId: student.studentId,
        department: student.department,
        yearOfStudy: student.yearOfStudy,
      },
      token,
      refreshToken,
    });
  } catch (error) {
    if (session && session.inTransaction()) {
      await session.abortTransaction();
    }
    console.error("Student login error:", {
      event: "student_login_error",
      error: error.message,
      timestamp: new Date().toISOString(),
    });
    return res.status(error.statusCode || 400).json({
      success: false,
      message: error.message || "Internal server error",
    });
  } finally {
    if (session) {
      session.endSession();
    }
  }
};

const logFailedLogin = async (email, ip, deviceId, studentId, schoolId, failedAttempts, session) => {
    console.log("230")
    try {
      console.log("231", { email, studentId, schoolId, failedAttempts });
    const fraudScore = Math.min(failedAttempts * 20, 100); // Simple rule: 20 points per failed attempt
    const transactionLog = new TransactionLog({
      studentId,
      schoolId,
      action: "student_login_failure",
      metadata: { ip, deviceId, email, fraudScore },
    });
    // await transactionLog.save({ session });
    await transactionLog.save();

    console.log("243");
  } catch (error) {
    console.error("Failed to log failed login:", {
      event: "log_failed_login_error",
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
};