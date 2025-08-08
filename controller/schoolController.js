// controllers/schoolController.js
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import validator from "validator";
import School from "../models/School.js";
import TransactionLog from "../models/TransactionLog.js";
import Notification from "../models/Notification.js";
import RefreshToken from "../models/RefreshToken.js";
import Student from "../models/Student.js";
import Payment from '../models/Payment.js'
import Fee from '../models/Fee.js'
import Refund from '../models/Refund.js'
import {
  sendWelcomeEmail,
  sendFailedLoginEmail,
  sendStudentWelcomeEmail,
  sendAdminStudentAddedEmail,
} from "../utils/email.js";
import {
  JWT_SECRET,
  JWT_REFRESH_SECRET,
  JWT_EXPIRES_IN,
} from "../config/env.js";

export const register = async (req, res) => {
  let session = null;
  try {
    // Start MongoDB session
    session = await mongoose.startSession();
    session.startTransaction();

    const {
      name,
      email,
      password,
      contactDetails,
      customFields,
      paymentProviders,
    } = req.body;

    // Validate inputs
    const missingFields = [];
    if (!name) missingFields.push("name");
    if (!email) missingFields.push("email");
    if (!password) missingFields.push("password");
    if (!contactDetails) missingFields.push("contactDetails");
    if (!customFields) missingFields.push("customFields");
    if (!paymentProviders || paymentProviders.length === 0) {
      missingFields.push("At least one Paystack provider is required");
    }
    if (missingFields.length > 0) {
      throw new Error(`Missing required fields: ${missingFields.join(", ")}`);
    }

    if (!validator.isEmail(email)) {
      throw new Error("Invalid email format");
    }

    if (!validator.isMobilePhone(contactDetails.phone, "any")) {
      throw new Error("Invalid phone number format");
    }

    if (
      !validator.isStrongPassword(password, {
        minLength: 8,
        minLowercase: 1,
        minUppercase: 1,
        minNumbers: 1,
        minSymbols: 1,
      })
    ) {
      throw new Error(
        "Password must be at least 8 characters long and include uppercase, lowercase, numbers, and symbols."
      );
    }

    if (
      !paymentProviders.length ||
      !paymentProviders.some((p) => p.provider === "Paystack")
    ) {
      throw new Error("At least one payment provider (Paystack) is required.");
    }

    // Check for duplicate email
    const existingSchool = await School.findOne({ email }).session(session);
    if (existingSchool) {
      throw new Error("School with this email already exists");
    }

    // Create and save school
    console.log("Creating School document:", { name, email });
    const school = new School({
      name,
      email,
      password,
      contactDetails,
      customFields,
      paymentProviders,
    });
    await school.save({ session });
    console.log("School saved:", school._id);

    // Generate JWT and refresh token
    const token = jwt.sign(
      { id: school._id, email: school.email },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );
    const refreshToken = jwt.sign({ id: school._id }, JWT_REFRESH_SECRET, {
      expiresIn: "7d",
    });

    // Save refresh token
    console.log("Creating RefreshToken document:", { schoolId: school._id });
    const refreshTokenDoc = new RefreshToken({
      schoolId: school._id,
      token: refreshToken,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
    await refreshTokenDoc.save({ session });
    console.log("RefreshToken saved:", refreshTokenDoc._id);

    // Log registration
    console.log("Creating TransactionLog document:", { schoolId: school._id });
    const transactionLog = new TransactionLog({
      schoolId: school._id,
      action: "school_registration",
      metadata: {
        ip: req.ip,
        deviceId: req.headers["user-agent"],
      },
    });
    await transactionLog.save({ session });
    console.log("TransactionLog saved:", transactionLog._id);

    // Commit transaction
    await session.commitTransaction();

    // Send welcome email and log notification
    try {
      console.log("Sending welcome email to:", school.email);
      await sendWelcomeEmail(school);
      console.log("Creating Notification document:", {
        recipient: school.email,
      });
      const notification = new Notification({
        recipient: school.email,
        type: "school_registration",
        message: `School ${school.name} registered successfully`,
        schoolId: school._id,
        status: "sent",
        sentAt: new Date(),
      });
      await notification.save();
      console.log("Notification saved:", notification._id);
    } catch (notificationError) {
      console.error(
        "Non-critical error (notification/email):",
        notificationError
      );
      // Continue despite notification/email failure
    }

    // End session
    if (session) {
      session.endSession();
    }

    // Increment Prometheus counter (uncomment when set up)
    // prometheus.register.getSingleMetric('school_registrations_total').inc();

    return res.status(201).json({
      success: true,
      data: { _id: school._id, name: school.name, email: school.email },
      token,
      refreshToken,
    });
  } catch (error) {
    if (session && session.inTransaction()) {
      await session.abortTransaction();
    }
    if (session) {
      session.endSession();
    }
    console.error("Registration error:", error);
    return res.status(error.statusCode || 400).json({
      success: false,
      message: error.message || "Internal server error",
    });
  }
};

export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    console.log("Login attempt:", {
      email,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });

    const missingFields = [];
    if (!email) missingFields.push("email");
    if (!password) missingFields.push("password");
    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missingFields.join(", ")}`,
      });
    }

    if (!validator.isEmail(email)) {
      return res.status(400).json({
        success: false,
        message: "Invalid email format",
      });
    }

    console.log("Finding school by email:", email);
    const school = await School.findOne({ email });
    console.log("School found:", school ? school._id : "not found");
    if (!school) {
      console.log("School not found for email:", email);
      await logFailedLogin(email, req.ip, req.headers["user-agent"], null);
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    const isMatch = await bcrypt.compare(password, school.password);
    if (!isMatch) {
      console.log("Password mismatch for school:", school._id);
      await logFailedLogin(
        email,
        req.ip,
        req.headers["user-agent"],
        school._id
      ); // Pass school._id instead of null
      console.log("Sending failed login email to:", school.email);
      await sendFailedLoginEmail(school, req.ip, new Date());
      console.log("Creating Notification document for login failure:", {
        recipient: school.email,
      });
      await new Notification({
        recipient: school.email,
        type: "login_failure",
        message: `Failed login attempt for ${school.email}`,
        schoolId: school._id,
        status: "sent",
        sentAt: new Date(),
      }).save();

      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    // Generate JWT and refresh token
    const token = jwt.sign(
      { id: school._id, email: school.email },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );
    const refreshToken = jwt.sign({ id: school._id }, JWT_REFRESH_SECRET, {
      expiresIn: "7d",
    });
    await new RefreshToken({
      schoolId: school._id,
      token: refreshToken,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    }).save();

    // Log successful login
    await new TransactionLog({
      schoolId: school._id,
      action: "school_login_success",
      metadata: {
        ip: req.ip,
        deviceId: req.headers["user-agent"],
      },
    }).save();

    res.status(200).json({
      success: true,
      data: { _id: school._id, name: school.name, email: school.email },
      token,
      refreshToken,
    });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(error.statusCode || 400).json({
      success: false,
      message: error.message || "Internal server error",
    });
  }
};

const logFailedLogin = async (email, ip, deviceId, schoolId) => {
  try {
    await new TransactionLog({
      schoolId, // Can be null for non-existent email
      action: "school_login_failure",
      metadata: { ip, deviceId, email }, // Include email for debugging
    }).save();
  } catch (error) {
    console.error("Failed to log failed login:", error);
    // Swallow the error to prevent disrupting the login response
  }
};

export const addStudent = async (req, res) => {
  let session = null;
  try {
    // Start MongoDB session
    session = await mongoose.startSession();
    session.startTransaction();

    const {
      name,
      email,
      password,
      phone,
      studentId,
      department,
      yearOfStudy,
      registrationInfo,
      courses,
    } = req.body;

    // Validate inputs
    const missingFields = [];
    if (!name) missingFields.push("name");
    if (!email) missingFields.push("email");
    if (!password) missingFields.push("password");
    if (!studentId) missingFields.push("studentId");
    if (!department) missingFields.push("department");
    if (!yearOfStudy) missingFields.push("yearOfStudy");
    if (missingFields.length > 0) {
      throw new Error(`Missing required fields: ${missingFields.join(", ")}`);
    }

    if (!validator.isEmail(email)) {
      throw new Error("Invalid email format");
    }

    if (phone && !validator.isMobilePhone(phone, "any")) {
      throw new Error("Invalid phone number format");
    }

    if (
      !validator.isStrongPassword(password, {
        minLength: 8,
        minLowercase: 1,
        minUppercase: 1,
        minNumbers: 1,
        minSymbols: 1,
      })
    ) {
      throw new Error(
        "Password must be at least 8 characters long and include uppercase, lowercase, numbers, and symbols."
      );
    }

    const allowedDepartments = [
      "Computer Science",
      "Engineering",
      "Business",
      "Arts",
      "Sciences",
      "Medicine",
    ];
    if (!allowedDepartments.includes(department)) {
      throw new Error(
        `Department must be one of: ${allowedDepartments.join(", ")}`
      );
    }

    const allowedYears = ["Freshman", "Sophomore", "Junior", "Senior"];
    if (!allowedYears.includes(yearOfStudy)) {
      throw new Error(
        `Year of study must be one of: ${allowedYears.join(", ")}`
      );
    }

    const allowedCourses = [
      "CS101",
      "ENG201",
      "BUS301",
      "ART101",
      "SCI201",
      "MED101",
    ];
    if (courses && courses.length > 0) {
      for (const course of courses) {
        if (!allowedCourses.includes(course)) {
          throw new Error(
            `Course ${course} is not valid. Must be one of: ${allowedCourses.join(
              ", "
            )}`
          );
        }
      }
    }

    // Get school from JWT
    const schoolId = req.user.id; // From authenticateSchool middleware
    const school = await School.findById(schoolId).session(session);
    if (!school) {
      throw new Error("School not found");
    }

    // Validate studentId format (e.g., KNUST-123)
    const studentIdRegex = new RegExp(`^${school.name}-\\d+$`);
    if (!studentIdRegex.test(studentId)) {
      throw new Error(`Student ID must follow format: ${school.name}-<number>`);
    }

    // Check for duplicate email or studentId
    const existingStudent = await Student.findOne({
      $or: [{ email }, { $and: [{ schoolId, studentId }] }],
    }).session(session);
    if (existingStudent) {
      throw new Error("Student email or studentId already exists");
    }

    // Create student
    console.log("Creating Student document:", { name, email, studentId });
    const student = new Student({
      schoolId,
      name,
      email,
      password,
      phone,
      studentId,
      department,
      yearOfStudy,
      registrationInfo: {
        enrollmentDate: registrationInfo?.enrollmentDate || "",
        program: registrationInfo?.program || "",
        emergencyContact: registrationInfo?.emergencyContact || "",
        studentType: registrationInfo?.studentType || "",
        guardianName: registrationInfo?.guardianName || "",
      },
      courses: courses || [],
    });
    await student.save({ session });
    console.log("Student saved:", student._id);

    // Update school's students array
    await School.updateOne(
      { _id: schoolId },
      { $addToSet: { students: student._id } },
      { session }
    );
    console.log("School updated with student ID:", student._id);

    // Log transaction
    console.log("Creating TransactionLog document:", {
      schoolId,
      studentId: student._id,
    });
    const transactionLog = new TransactionLog({
      schoolId,
      action: "student_added",
      metadata: {
        ip: req.ip,
        deviceId: req.headers["user-agent"],
        adminId: schoolId, // Track who added the student
        studentId: student._id,
      },
    });
    await transactionLog.save({ session });
    console.log("TransactionLog saved:", transactionLog._id);

    // Commit transaction
    await session.commitTransaction();

    // Send emails and log notifications
    try {
      console.log("Sending student welcome email to:", email);
      await sendStudentWelcomeEmail(
        student,
        school,
        password,
        student.studentId
      ); // Pass plain-text password
      console.log("Creating Notification document for student:", {
        recipient: email,
      });
      const studentNotification = new Notification({
        recipient: email,
        type: "student_added",
        message: `Student ${name} added to ${school.name}`,
        schoolId,
        studentId: student._id,
        status: "sent",
        sentAt: new Date(),
      });
      await studentNotification.save();
      console.log("Student Notification saved:", studentNotification._id);

      console.log("Sending admin notification email to:", school.email);
      await sendAdminStudentAddedEmail(school, student);
      console.log("Creating Notification document for admin:", {
        recipient: school.email,
      });
      const adminNotification = new Notification({
        recipient: school.email,
        type: "student_added_admin",
        message: `Student ${name} added to your school`,
        schoolId,
        studentId: student._id,
        status: "sent",
        sentAt: new Date(),
      });
      await adminNotification.save();
      console.log("Admin Notification saved:", adminNotification._id);
    } catch (notificationError) {
      console.error(
        "Non-critical error (notification/email):",
        notificationError
      );
    }

    // End session
    if (session) {
      session.endSession();
    }

    // Increment Prometheus counter (uncomment when set up)
    // prometheus.register.getSingleMetric('students_added_total').inc();

    return res.status(201).json({
      success: true,
      data: {
        _id: student._id,
        name: student.name,
        email: student.email,
        studentId: student.studentId,
        department: student.department,
        yearOfStudy: student.yearOfStudy,
        phone: student.phone,
        registrationInfo: student.registrationInfo,
        courses: student.courses,
      },
    });
  } catch (error) {
    if (session && session.inTransaction()) {
      await session.abortTransaction();
    }
    if (session) {
      session.endSession();
    }
    console.error("Add student error:", error);
    return res.status(error.statusCode || 400).json({
      success: false,
      message: error.message || "Internal server error",
    });
  }
};

export const getAdminDashboard = async (req, res) => {
  try {
    const { id: schoolId, email } = req.user;
    const { data, status, academicSession } = req.query;

    console.log("School dashboard access:", {
      event: "school_dashboard_access",
      schoolId,
      email,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
      timestamp: new Date().toISOString(),
    });

    // Verify school exists
    const school = await School.findById(schoolId).select(
      "_id name email contactDetails customFields.receiptBranding"
    );
    if (!school) {
      console.error("School not found:", {
        event: "school_dashboard_error",
        schoolId,
        error: "School not found",
        timestamp: new Date().toISOString(),
      });
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    // Calculate fraud score (10 points per access in 10 minutes, capped at 100)
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    const accessAttempts = await TransactionLog.countDocuments({
      action: "school_dashboard_access",
      schoolId,
      createdAt: { $gte: tenMinutesAgo },
    });
    const fraudScore = Math.min(accessAttempts * 10, 100);

    // Log dashboard access
    await new TransactionLog({
      schoolId,
      action: "school_dashboard_access",
      metadata: {
        ip: req.ip,
        deviceId: req.headers["user-agent"],
        fraudScore,
      },
    }).save();

    // Initialize response data
    let responseData = {
      school: {
        _id: school._id,
        name: school.name,
        email: school.email,
        contactDetails: school.contactDetails,
        receiptBranding: school.customFields.receiptBranding,
      },
      payments: [],
      students: [],
      fees: [],
      reports: {},
    };

    // Fetch payments (if not restricted)
    if (!data || data === "payments") {
      let paymentQuery = { schoolId };
      if (status) {
        paymentQuery.status = status;
      }
      const payments = await Payment.find(paymentQuery)
        .populate({
          path: "studentId",
          select: "_id name studentId",
        })
        .populate({
          path: "feeId",
          select: "_id feeType academicSession dueDate",
        })
        .select(
          "_id studentId feeId amount paymentProvider status receiptUrl createdAt"
        );
      responseData.payments = payments.map((payment) => ({
        _id: payment._id,
        student: {
          _id: payment.studentId._id,
          name: payment.studentId.name,
          studentId: payment.studentId.studentId,
        },
        fee: {
          _id: payment.feeId._id,
          feeType: payment.feeId.feeType,
          academicSession: payment.feeId.academicSession,
          dueDate: payment.feeId.dueDate,
        },
        amount: payment.amount,
        paymentProvider: payment.paymentProvider,
        status: payment.status,
        receiptUrl: payment.receiptUrl,
        createdAt: payment.createdAt,
      }));
    }

    // Fetch students (if not restricted)
    if (!data || data === "students") {
      const students = await Student.find({ schoolId }).select(
        "_id name email studentId department yearOfStudy courses"
      );
      responseData.students = students.map((student) => ({
        _id: student._id,
        name: student.name,
        email: student.email,
        studentId: student.studentId,
        department: student.department,
        yearOfStudy: student.yearOfStudy,
        courses: student.courses,
      }));
    }

    // Fetch fees (if not restricted)
    if (!data || data === "fees") {
      let feeQuery = { schoolId };
      if (academicSession) {
        feeQuery.academicSession = academicSession;
      }
      const fees = await Fee.find(feeQuery).select(
        "_id feeType amount dueDate academicSession allowPartialPayment"
      );
      responseData.fees = fees.map((fee) => ({
        _id: fee._id,
        feeType: fee.feeType,
        amount: fee.amount,
        dueDate: fee.dueDate,
        academicSession: fee.academicSession,
        allowPartialPayment: fee.allowPartialPayment,
      }));
    }

    // Generate reports (if not restricted to specific data)
    if (!data) {
      const totalPayments = await Payment.aggregate([
        {
          $match: {
            schoolId: new mongoose.Types.ObjectId(schoolId),
            status: "confirmed",
          },
        },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]);
      const pendingPayments = await Payment.countDocuments({
        schoolId,
        status: "pending",
      });
      const confirmedPayments = await Payment.countDocuments({
        schoolId,
        status: "confirmed",
      });
      const studentCount = await Student.countDocuments({ schoolId });
      const overdueFees = await Fee.countDocuments({
        schoolId,
        dueDate: { $lt: new Date() },
      });
      const requestedRefunds = await Refund.countDocuments({
        schoolId,
        status: "requested",
      });
      const approvedRefunds = await Refund.countDocuments({
        schoolId,
        status: "approved",
      });

      responseData.reports = {
        totalPayments: totalPayments[0]?.total || 0,
        pendingPayments,
        confirmedPayments,
        studentCount,
        overdueFees,
        requestedRefunds,
        approvedRefunds,
      };
    }

    // Handle empty data
    if (
      responseData.payments.length === 0 &&
      responseData.students.length === 0 &&
      responseData.fees.length === 0
    ) {
      responseData.message = "No data found for this school.";
    }

    // Increment Prometheus counter (uncomment when set up)
    // prometheus.register.getSingleMetric('school_dashboard_access_total').inc();

    return res.status(200).json({
      success: true,
      data: responseData,
    });
  } catch (error) {
    console.error("School dashboard error:", {
      event: "school_dashboard_error",
      schoolId: req.user?.id,
      email: req.user?.email,
      error: error.message,
      timestamp: new Date().toISOString(),
    });
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Internal server error",
    });
  }
};
