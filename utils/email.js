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
    from: "your-email@gmail.com",
    to: school.email,
    subject: `Welcome to Fee Payment System, ${school.name}!`,
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
