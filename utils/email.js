import nodemailer from "nodemailer";
import { EMAIL_PASSWORD, SYSTEM_NAME } from "../config/env.js";

export const FROM_EMAIL = "kojoameyaw519@gmail.com";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: FROM_EMAIL,
    pass: EMAIL_PASSWORD,
  },
});

export const sendWelcomeEmail = async (school) => {
  const mailOptions = {
    from: FROM_EMAIL,
    to: school.email,
    subject: `Welcome to ${SYSTEM_NAME}, ${school.name}!`,
    html: `
      <h1>Welcome, ${school.name}!</h1>
      <p>Your school has been successfully registered.</p>
      <p>Access the admin portal at: <a href="${process.env.ADMIN_URL}">${
      process.env.ADMIN_URL
    }</a></p>
      <p style="color: ${school.customFields.receiptBranding.primaryColor}">
        Thank you for joining!
      </p>
      ${
        school.customFields.receiptBranding.logoUrl
          ? `<img src="${school.customFields.receiptBranding.logoUrl}" alt="School Logo" />`
          : ""
      }
    `,
  };

  await transporter.sendMail(mailOptions);
};

export const sendFailedLoginEmail = async (school, ip, timestamp) => {
  const mailOptions = {
    from: FROM_EMAIL,
    to: school.email,
    subject: `Failed Login Attempt for ${SYSTEM_NAME}`,
    html: `
      <h1>Security Alert for ${school.name}</h1>
      <p>A failed login attempt was detected for your account.</p>
      <p>Time: ${timestamp.toISOString()}</p>
      <p>IP Address: ${ip}</p>
      <p style="color: ${school.customFields.receiptBranding.primaryColor}">
        If this was not you, please secure your account.
      </p>
      ${
        school.customFields.receiptBranding.logoUrl
          ? `<img src="${school.customFields.receiptBranding.logoUrl}" alt="School Logo" />`
          : ""
      }
    `,
  };

  await transporter.sendMail(mailOptions);
};

export const sendStudentWelcomeEmail = async (student, school, plainPassword) => {
  const mailOptions = {
    from: `"${school.name} Payment System" <${FROM_EMAIL}>`,
    to: student.email,
    subject: `Welcome to ${school.name}`,
    html: `
      <h1 style="color: ${school.customFields.receiptBranding.primaryColor}">Welcome, ${student.name}!</h1>
      <p>You have been added as a student at ${school.name}.</p>
      <p><strong>Email:</strong> ${student.email}</p>
      <p><strong>Password:</strong> ${plainPassword}</p>
      <p style="color: red; font-weight: bold;">
        For security, please reset your password after your first login.
      </p>
      <p><a href="http://localhost:3000/reset-password">Reset Password </a></p>
      <p>Login to view your payment history and courses at: <a href="http://localhost:3000/login">Login</a></p>
      ${
        school.customFields.receiptBranding.logoUrl
          ? `<img src="${school.customFields.receiptBranding.logoUrl}" alt="School Logo" style="max-width: 200px;" />`
          : ''
      }
    `,
  };
  await transporter.sendMail(mailOptions);
};

export const sendAdminStudentAddedEmail = async (school, student) => {
  const mailOptions = {
    from: `"School Payment System" <${FROM_EMAIL}>`,
    to: school.email,
    subject: `New Student Added: ${student.name}`,
    html: `
      <h1>New Student Added</h1>
      <p>A new student has been added to ${school.name}.</p>
      <p><strong>Name:</strong> ${student.name}</p>
      <p><strong>Email:</strong> ${student.email}</p>
      <p><strong>Student ID:</strong> ${student.studentId}</p>
      <p><strong>Department:</strong> ${student.department}</p>
      <p><strong>Year of Study:</strong> ${student.yearOfStudy}</p>
      <p>Manage students in your admin portal.</p>
      <p><a href="http://localhost:3000/admin">Admin Portal</a></p>
    `,
  };
  await transporter.sendMail(mailOptions);
};
