# Supabase Email Template - Confirm Signup

## Instructions

1. Go to **Supabase Dashboard** → **Authentication** → **Email Templates**
2. Select **"Confirm Signup"** template
3. Replace the entire template with the HTML below
4. Save the template

---

## Email Template HTML

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Confirm Your Email - EgyptGold Pro</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #000000; color: #ffffff;">
  <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #000000;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 600px; width: 100%; border-collapse: collapse; background-color: #111827; border: 1px solid #374151; border-radius: 8px; overflow: hidden;">
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 30px; text-align: center; background-color: #111827;">
              <h1 style="margin: 0; font-size: 28px; font-weight: bold; color: #D4AF37; letter-spacing: 0.5px;">
                EgyptGold Pro
              </h1>
            </td>
          </tr>
          
          <!-- Main Content -->
          <tr>
            <td style="padding: 0 40px 40px;">
              <h2 style="margin: 0 0 20px; font-size: 24px; font-weight: 600; color: #F9FAFB; text-align: center;">
                Confirm Your Email Address
              </h2>
              
              <p style="margin: 0 0 30px; font-size: 16px; line-height: 1.6; color: #D1D5DB; text-align: center;">
                Thank you for signing up for EgyptGold Pro! Please confirm your email address by clicking the button below.
              </p>
              
              <!-- CTA Button -->
              <table role="presentation" style="width: 100%; border-collapse: collapse; margin: 0 0 30px;">
                <tr>
                  <td align="center" style="padding: 0;">
                    <a href="{{ .ConfirmationURL }}" style="display: inline-block; padding: 14px 32px; background-color: #D4AF37; color: #000000; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px; text-align: center; min-width: 200px;">
                      Confirm Email
                    </a>
                  </td>
                </tr>
              </table>
              
              <!-- Alternative Link -->
              <p style="margin: 0 0 20px; font-size: 14px; line-height: 1.6; color: #9CA3AF; text-align: center;">
                If the button doesn't work, copy and paste this link into your browser:
              </p>
              <p style="margin: 0 0 30px; font-size: 12px; line-height: 1.6; color: #6B7280; word-break: break-all; text-align: center; font-family: monospace; background-color: #1F2937; padding: 12px; border-radius: 4px;">
                {{ .ConfirmationURL }}
              </p>
              
              <!-- Steps -->
              <div style="background-color: #1F2937; border-radius: 6px; padding: 20px; margin: 0 0 30px;">
                <p style="margin: 0 0 15px; font-size: 14px; font-weight: 600; color: #F9FAFB;">
                  Next Steps:
                </p>
                <ol style="margin: 0; padding-left: 20px; color: #D1D5DB; font-size: 14px; line-height: 1.8;">
                  <li style="margin-bottom: 8px;">Click the "Confirm Email" button above</li>
                  <li style="margin-bottom: 8px;">You'll be redirected to the login page</li>
                  <li style="margin-bottom: 0;">Sign in with your email and password</li>
                </ol>
              </div>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 30px 40px; background-color: #0F172A; border-top: 1px solid #374151;">
              <p style="margin: 0 0 15px; font-size: 12px; line-height: 1.6; color: #9CA3AF; text-align: center;">
                If you didn't create this account, you can safely ignore this email.
              </p>
              <p style="margin: 0; font-size: 12px; line-height: 1.6; color: #6B7280; text-align: center;">
                © 2024 EgyptGold Pro. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
```

---

## Template Variables

Supabase automatically replaces:
- `{{ .ConfirmationURL }}` - The confirmation link URL

---

## Preview Notes

- **Dark Theme**: Matches EgyptGold Pro's dark UI
- **Gold Accent**: Uses #D4AF37 (gold) for branding
- **Responsive**: Works on mobile and desktop email clients
- **Email-Safe HTML**: No JavaScript, inline styles only
- **Accessible**: Proper semantic HTML structure

---

## Testing

After saving the template:
1. Sign up a new user
2. Check the email inbox
3. Verify the email matches the branding
4. Click the confirmation link
5. Verify redirect to `/auth/confirmed` page
