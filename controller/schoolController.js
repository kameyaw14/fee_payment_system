// controllers/schoolController.js
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import validator from "validator";
import School from "../models/School.js";
import TransactionLog from "../models/TransactionLog.js";
import Notification from "../models/Notification.js";
import RefreshToken from "../models/RefreshToken.js";
import { sendWelcomeEmail, sendFailedLoginEmail } from "../utils/email.js";
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
      console.log("Creating Notification document:", { recipient: school.email });
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
      console.error("Non-critical error (notification/email):", notificationError);
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
    console.log("Login attempt:", { email, ip: req.ip, userAgent: req.headers["user-agent"] });

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
      await logFailedLogin(email, req.ip, req.headers["user-agent"], school._id); // Pass school._id instead of null
      console.log("Sending failed login email to:", school.email);
      await sendFailedLoginEmail(school, req.ip, new Date());
      console.log("Creating Notification document for login failure:", { recipient: school.email });
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
