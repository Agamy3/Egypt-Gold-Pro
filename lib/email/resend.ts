/**
 * Resend Email Service
 * 
 * Sends emails using Resend API
 * FROM: EgyptGold Pro <notification@egyptgoldpro.com>
 */

import 'server-only';

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const NOTIF_FROM_EMAIL = process.env.NOTIF_FROM_EMAIL || 'notification@egyptgoldpro.com';
const NOTIF_FROM_NAME = process.env.NOTIF_FROM_NAME || 'EgyptGold Pro';
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://egyptgoldpro.com';

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/**
 * Send an email using Resend
 */
export async function sendNotificationEmail(
  options: EmailOptions
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  if (!RESEND_API_KEY) {
    const errorMsg = 'RESEND_API_KEY not configured. Email sending disabled.';
    console.error('[EMAIL]', errorMsg);
    console.error('[EMAIL] Please set RESEND_API_KEY in your environment variables.');
    return {
      success: false,
      error: errorMsg,
    };
  }

  if (!NOTIF_FROM_EMAIL || !NOTIF_FROM_NAME) {
    const errorMsg = 'NOTIF_FROM_EMAIL or NOTIF_FROM_NAME not configured.';
    console.error('[EMAIL]', errorMsg);
    return {
      success: false,
      error: errorMsg,
    };
  }

  console.log('[EMAIL] Attempting to send email:', {
    to: options.to,
    subject: options.subject,
    from: `${NOTIF_FROM_NAME} <${NOTIF_FROM_EMAIL}>`,
  });

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${NOTIF_FROM_NAME} <${NOTIF_FROM_EMAIL}>`,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text || options.html.replace(/<[^>]*>/g, ''), // Strip HTML for text fallback
      }),
    });

    const responseText = await response.text();
    let errorData: any = { message: 'Unknown error' };
    
    try {
      errorData = JSON.parse(responseText);
    } catch {
      errorData = { message: responseText || `HTTP ${response.status}: ${response.statusText}` };
    }

    if (!response.ok) {
      console.error('[EMAIL] Resend API error:', {
        status: response.status,
        statusText: response.statusText,
        error: errorData,
        responseBody: responseText,
      });
      return {
        success: false,
        error: errorData.message || errorData.error?.message || `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    const data = JSON.parse(responseText);
    console.log('[EMAIL] Email sent successfully via Resend:', {
      messageId: data.id,
      to: options.to,
      subject: options.subject,
    });

    return {
      success: true,
      messageId: data.id,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[EMAIL] Failed to send email via Resend:', {
      to: options.to,
      subject: options.subject,
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
    });

    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Format price change notification email
 */
export function formatPriceChangeEmail(
  country: 'EG' | 'AE' | 'SA' | 'US',
  karat: number,
  direction: 'UP' | 'DOWN',
  pctChange: number,
  oldPrice: number,
  newPrice: number,
  currency: string
): { subject: string; html: string; text: string } {
  const countryNames: Record<string, string> = {
    EG: 'Egypt',
    AE: 'UAE',
    SA: 'Saudi Arabia',
    US: 'USA',
  };

  const countryName = countryNames[country] || country;
  const pctFormatted = (pctChange * 100).toFixed(2);
  const oldPriceFormatted = oldPrice.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const newPriceFormatted = newPrice.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const subject = `${countryName} Gold Update: ${karat}k ${direction} ${pctFormatted}%`;
  const url = `${SITE_URL}/?country=${country}&currency=${currency}`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%); padding: 30px; border-radius: 8px; margin-bottom: 20px;">
    <h1 style="color: #d4af37; margin: 0; font-size: 24px;">${countryName} Gold Update</h1>
  </div>
  
  <div style="background: #f9f9f9; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
    <h2 style="color: #333; margin-top: 0;">Price Change Alert</h2>
    
    <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
      <tr>
        <td style="padding: 8px; font-weight: bold; color: #666;">Country:</td>
        <td style="padding: 8px;">${countryName}</td>
      </tr>
      <tr>
        <td style="padding: 8px; font-weight: bold; color: #666;">Karat:</td>
        <td style="padding: 8px;">${karat}k</td>
      </tr>
      <tr>
        <td style="padding: 8px; font-weight: bold; color: #666;">Direction:</td>
        <td style="padding: 8px; font-size: 18px; color: ${direction === 'UP' ? '#22c55e' : '#ef4444'}; font-weight: bold;">${direction} ${pctFormatted}%</td>
      </tr>
      <tr>
        <td style="padding: 8px; font-weight: bold; color: #666;">Previous Price:</td>
        <td style="padding: 8px;">${currency} ${oldPriceFormatted}</td>
      </tr>
      <tr>
        <td style="padding: 8px; font-weight: bold; color: #666;">Current Price:</td>
        <td style="padding: 8px; font-size: 18px; color: #d4af37; font-weight: bold;">${currency} ${newPriceFormatted}</td>
      </tr>
    </table>
  </div>
  
  <div style="text-align: center; margin: 30px 0;">
    <a href="${url}" style="display: inline-block; background: #d4af37; color: #1a1a1a; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">View Market Data</a>
  </div>
  
  <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666;">
    <p>This is an automated notification from EgyptGold Pro.</p>
    <p>You can manage your notification preferences at <a href="${SITE_URL}/account/notifications">${SITE_URL}/account/notifications</a></p>
  </div>
</body>
</html>
  `.trim();

  const text = `
${countryName} Gold Update: ${karat}k ${direction} ${pctFormatted}%

Price Change Alert:
- Country: ${countryName}
- Karat: ${karat}k
- Direction: ${direction} ${pctFormatted}%
- Previous Price: ${currency} ${oldPriceFormatted}
- Current Price: ${currency} ${newPriceFormatted}

View Market Data: ${url}

Manage your notification preferences: ${SITE_URL}/account/notifications

This is an automated notification from EgyptGold Pro.
  `.trim();

  return { subject, html, text };
}

