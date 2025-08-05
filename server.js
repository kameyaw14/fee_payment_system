import express from "express";
import dotenv from "dotenv";
import mongoose from "mongoose";
import cors from "cors";
import helmet from "helmet";
import connectCloudinary from "./config/connectCloudinary.js";
import connectDB from "./db/connectDb.js";
import { PRODUCTION_URL, SYSTEM_NAME } from "./config/env.js";
import userRouter from "./routes/userRoutes.js";
import errorMiddleware from "./middleware/error.js";
import arcjetMiddleware from "./middleware/arcjet.js";
import schoolRouter from "./routes/schoolRoutes.js";



const app = express();

let server;
dotenv.config();

const PORT = process.env.PORT || 3000;

connectCloudinary();

const corsOptions = {
  origin: (origin, callback) => {
    const allowedOrigins = [
      process.env.CLIENT_URL,
      "http://localhost:8081",

    ].filter(Boolean);
    console.log("CORS request origin:", origin);
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.log("CORS rejected origin:", origin);
      callback(new Error(`Origin ${origin} not allowed by CORS`));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200,
};

// Security headers with helmet
app.use(
  helmet.contentSecurityPolicy({
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "https://res.cloudinary.com"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https://res.cloudinary.com"],
      connectSrc: ["'self'", PRODUCTION_URL, "https://api.cloudinary.com"],
    },
  })
);

app.use(cors(corsOptions));
app.use(express.json());

app.use("/api/v1", userRouter);
app.use("/api/v1/school", schoolRouter);

app.get("/", arcjetMiddleware, (req, res) => {
  res.status(200).json({
    success: true,
    message:  `${SYSTEM_NAME} server running!!`,
    environment: process.env.NODE_ENV || "development",
    timestamp: new Date().toISOString(),
  });
});

// 404 handler
app.use(arcjetMiddleware, (req, res) => {
  res.status(404).json({
    success: false,
    message: "Endpoint does not exist.",
  });
});

// app.use(arcjetMiddleware)

app.use(errorMiddleware)

const startServer = async () => {
  try {
    await connectDB();
    server = app.listen(PORT, () => {
      console.log(`Server running in ${process.env.NODE_ENV || "development"} mode`);
      console.log(`Server is running on http://localhost:${PORT}`);
      console.log(`Allowed client URL: ${process.env.CLIENT_URL}`);
      console.log(`Allowed admin URL: ${process.env.ADMIN_CLIENT_URL}`);
      console.log(`JWT_SECRET: ${process.env.JWT_SECRET ? "Set" : "Missing"}`);
      console.log(`JWT_REFRESH_SECRET: ${process.env.JWT_REFRESH_SECRET ? "Set" : "Missing"}`);
    });
  } catch (error) {
    console.error("Failed to start server", error);
    process.exit(1);
  }
};

startServer();

process.on("unhandledRejection", (err) => {
  console.error("Unhandled Rejection:", err);
  server?.close(() => process.exit(1));
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
  process.exit(1);
});