/**
 * Email Formatting Utilities
 * Formats notification emails (HTML templates)
 */

import 'server-only';

export function formatNotificationEmail(
  country: string,
  karat: number,
  side: 'buy' | 'sell',
  currency: string,
  direction: 'above' | 'below',
  threshold: number,
  currentPrice: number,
  siteUrl: string = 'https://egyptgoldpro.com'
): { subject: string; html: string } {
  const countryName = {
    EG: 'Egypt',
    AE: 'UAE',
    SA: 'Saudi Arabia',
    US: 'USA',
  }[country] || country;

  const sideLabel = side === 'buy' ? 'Buy' : 'Sell';
  const directionLabel = direction === 'above' ? 'exceeded' : 'dropped below';
  const thresholdFormatted = threshold.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const currentPriceFormatted = currentPrice.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const subject = `Gold Price Alert: ${countryName} ${karat}k ${sideLabel} ${directionLabel} ${currency} ${thresholdFormatted}`;

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
    <h1 style="color: #d4af37; margin: 0; font-size: 24px;">Gold Price Alert</h1>
  </div>
  
  <div style="background: #f9f9f9; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
    <h2 style="color: #333; margin-top: 0;">Your price threshold has been triggered!</h2>
    
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
        <td style="padding: 8px; font-weight: bold; color: #666;">Side:</td>
        <td style="padding: 8px;">${sideLabel}</td>
      </tr>
      <tr>
        <td style="padding: 8px; font-weight: bold; color: #666;">Threshold:</td>
        <td style="padding: 8px;">${currency} ${thresholdFormatted}</td>
      </tr>
      <tr>
        <td style="padding: 8px; font-weight: bold; color: #666;">Current Price:</td>
        <td style="padding: 8px; font-size: 18px; color: #d4af37; font-weight: bold;">${currency} ${currentPriceFormatted}</td>
      </tr>
      <tr>
        <td style="padding: 8px; font-weight: bold; color: #666;">Direction:</td>
        <td style="padding: 8px;">Price ${directionLabel} threshold</td>
      </tr>
    </table>
  </div>
  
  <div style="text-align: center; margin: 30px 0;">
    <a href="${siteUrl}/portfolio" style="display: inline-block; background: #d4af37; color: #1a1a1a; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">View Portfolio</a>
  </div>
  
  <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666;">
    <p>This is an automated notification from EgyptGold Pro.</p>
    <p>You can manage your notification preferences at <a href="${siteUrl}/account/notifications">${siteUrl}/account/notifications</a></p>
  </div>
</body>
</html>
  `.trim();

  return { subject, html };
}

