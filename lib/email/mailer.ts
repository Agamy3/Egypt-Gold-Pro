/**
 * Microsoft 365 SMTP Mailer
 * 
 * Sends emails using Microsoft 365 Exchange Online SMTP
 */

import 'server-only';
import nodemailer, { Transporter, SendMailOptions } from 'nodemailer';

const SMTP_HOST = process.env.SMTP_HOST || 'smtp.office365.com';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587', 10);
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const NOTIF_FROM_EMAIL = process.env.NOTIF_FROM_EMAIL || 'notification@egyptgoldpro.com';
const NOTIF_FROM_NAME = process.env.NOTIF_FROM_NAME || 'EgyptGold Pro';

let transporter: Transporter | null = null;

/**
 * Initialize the SMTP transporter
 */
function getTransporter(): Transporter {
  if (transporter) {
    return transporter;
  }

  if (!SMTP_USER || !SMTP_PASS) {
    throw new Error('SMTP credentials not configured. Please set SMTP_USER and SMTP_PASS environment variables.');
  }

  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: false, // Use STARTTLS
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
    tls: {
      ciphers: 'SSLv3',
      rejectUnauthorized: false, // For self-signed certificates if needed
    },
  });

  return transporter;
}

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/**
 * Send an email using Microsoft 365 SMTP
 */
export async function sendEmail(options: EmailOptions): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const mailer = getTransporter();

    const mailOptions: SendMailOptions = {
      from: `"${NOTIF_FROM_NAME}" <${NOTIF_FROM_EMAIL}>`,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text || options.html.replace(/<[^>]*>/g, ''), // Strip HTML tags for text fallback
    };

    const info = await mailer.sendMail(mailOptions);

    console.log('Email sent successfully:', {
      messageId: info.messageId,
      to: options.to,
      subject: options.subject,
    });

    return {
      success: true,
      messageId: info.messageId,
    };
  } catch (error: any) {
    // Log detailed SMTP error information
    const errorDetails = {
      message: error.message,
      code: error.code,
      command: error.command,
      response: error.response,
      responseCode: error.responseCode,
      smtp: error.smtp,
    };

    console.error('Failed to send email:', {
      to: options.to,
      subject: options.subject,
      error: errorDetails,
    });

    // Extract meaningful error message
    let errorMessage = error.message || 'Unknown error';
    if (error.response) {
      errorMessage = `${error.message}: ${error.response}`;
    } else if (error.code) {
      errorMessage = `${error.message} (Code: ${error.code})`;
    }

    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Verify SMTP connection
 */
export async function verifyConnection(): Promise<{ success: boolean; error?: string }> {
  try {
    const mailer = getTransporter();
    await mailer.verify();
    return { success: true };
  } catch (error: any) {
    console.error('SMTP connection verification failed:', error);
    return {
      success: false,
      error: error.message || 'SMTP verification failed',
    };
  }
}

