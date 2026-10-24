import nodemailer from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";
import { logger } from "./logger";

type PasswordResetEmailParams = {
  to: string;
  name: string;
  token: string;
};

const {
  SMTP_HOST,
  SMTP_PORT,
  SMTP_SECURE,
  SMTP_USER,
  SMTP_PASS,
  FRONTEND_URL,
  APP_NAME,
} = process.env;

const smtpConfig: SMTPTransport.Options = {
  host: SMTP_HOST,
  port: Number(SMTP_PORT) || 587,
  secure: SMTP_SECURE === "true",
  auth: {
    user: SMTP_USER,
    pass: SMTP_PASS,
  },
};

const transporter = nodemailer.createTransport(smtpConfig);

const getAppDisplayName = (): string => APP_NAME || "LPPM App";

const buildResetPasswordUrl = (token: string): string => {
  return `${FRONTEND_URL}/reset-password?token=${token}`;
};

const buildPasswordResetEmailHtml = (
  name: string,
  resetUrl: string,
): string => {
  return `
    <h2>Halo, ${name}</h2>
    <p>Klik link berikut untuk reset password Anda (berlaku 1 jam):</p>
    <a href="${resetUrl}" style="
      display:inline-block;
      padding:12px 24px;
      background:#4F46E5;
      color:#fff;
      text-decoration:none;
      border-radius:6px;
    ">Reset Password</a>
    <p>Jika Anda tidak meminta reset password, abaikan email ini.</p>
    <p style="color:#888;font-size:12px;">Link kadaluarsa dalam 1 jam.</p>
  `;
};

const buildPasswordResetMailOptions = ({
  to,
  name,
  token,
}: PasswordResetEmailParams) => {
  const resetUrl = buildResetPasswordUrl(token);

  return {
    from: `"${getAppDisplayName()}" <${SMTP_USER}>`,
    to,
    subject: "Reset Password",
    html: buildPasswordResetEmailHtml(name, resetUrl),
  };
};

const logEmailSendSuccess = (recipientEmail: string): void => {
  logger.info(`Password reset email sent to ${recipientEmail}`);
};

const logEmailSendFailure = (recipientEmail: string, error: unknown): void => {
  logger.error("Failed to send password reset email", {
    to: recipientEmail,
    error,
  });
};

export const sendPasswordResetEmail = async (
  to: string,
  name: string,
  token: string,
): Promise<void> => {
  try {
    const mailOptions = buildPasswordResetMailOptions({ to, name, token });
    await transporter.sendMail(mailOptions);
    logEmailSendSuccess(to);
  } catch (error) {
    logEmailSendFailure(to, error);
    throw new Error("Failed to send reset email");
  }
};

/*
  Opsional untuk dipanggil saat aplikasi bootstrap/starting,
  bukan saat request berjalan. Ini tidak mengubah behavior fungsi utama.
*/
export const verifyEmailTransporter = async (): Promise<void> => {
  try {
    await transporter.verify();
    logger.info("SMTP transporter is ready");
  } catch (error) {
    logger.error("SMTP transporter verification failed", { error });
    throw error;
  }
};
