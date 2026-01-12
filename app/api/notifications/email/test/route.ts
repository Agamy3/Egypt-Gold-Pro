/**
 * Email Test Endpoint
 * 
 * Sends a test email to verify SMTP configuration
 * 
 * POST /api/notifications/email/test
 * Body: { email: string }
 * Query: ?secret=CRON_SECRET
 */

import { NextResponse, type NextRequest } from 'next/server';
import { sendEmail } from '@/lib/email/mailer';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const secret = searchParams.get('secret');
    const expectedSecret = process.env.CRON_SECRET;

    if (!expectedSecret || secret !== expectedSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { email } = body;

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return NextResponse.json({ error: 'Valid email address required' }, { status: 400 });
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://egyptgoldpro.com';

    const result = await sendEmail({
      to: email,
      subject: 'EgyptGold Pro - Test Email',
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Test Email</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%); padding: 30px; border-radius: 8px; margin-bottom: 20px;">
    <h1 style="color: #d4af37; margin: 0; font-size: 24px;">Test Email from EgyptGold Pro</h1>
  </div>
  
  <div style="background: #f9f9f9; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
    <p>This is a test email to verify SMTP configuration.</p>
    <p>If you received this email, your Microsoft 365 SMTP setup is working correctly!</p>
    <p><strong>Timestamp:</strong> ${new Date().toISOString()}</p>
  </div>
  
  <div style="text-align: center; margin: 30px 0;">
    <a href="${siteUrl}" style="display: inline-block; background: #d4af37; color: #1a1a1a; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">Visit EgyptGold Pro</a>
  </div>
  
  <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666;">
    <p>This is an automated test email from EgyptGold Pro.</p>
  </div>
</body>
</html>
      `.trim(),
    });

    if (result.success) {
      return NextResponse.json({
        success: true,
        message: 'Test email sent successfully',
        messageId: result.messageId,
      });
    } else {
      return NextResponse.json(
        {
          success: false,
          error: result.error || 'Failed to send test email',
          details: 'Check server logs for SMTP error details',
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Test email error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

