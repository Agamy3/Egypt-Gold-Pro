# Microsoft 365 SMTP Setup Checklist

This document outlines the requirements and steps to configure Microsoft 365 (Exchange Online) for sending notification emails from EgyptGold Pro.

## Prerequisites

- Microsoft 365 Essential plan (or higher) with Exchange Online
- Admin access to Microsoft 365 Admin Center
- DNS access for your domain (egyptgoldpro.com)

---

## 1. Mailbox Setup

### ✅ Create Notification Mailbox

1. **Create the mailbox:**
   - Go to Microsoft 365 Admin Center → Users → Active users
   - Click "Add a user" or create a shared mailbox
   - Email: `notification@egyptgoldpro.com`
   - **Recommended:** Use a **Shared Mailbox** (no license required) OR a regular user mailbox

2. **Verify mailbox exists:**
   - Ensure the mailbox is fully provisioned (may take a few minutes)
   - Test by sending an email to `notification@egyptgoldpro.com`

---

## 2. SMTP Authentication

### ✅ Enable SMTP AUTH for the Mailbox

**Option A: Enable for Specific Mailbox (Recommended)**

1. Go to Microsoft 365 Admin Center → Exchange admin center
2. Navigate to **Recipients** → **Mailboxes**
3. Select the `notification@egyptgoldpro.com` mailbox
4. Click **Edit** (pencil icon)
5. Go to **Mailbox features** tab
6. Under **Email apps**, ensure **SMTP AUTH** is **Enabled**
7. Click **Save**

**Option B: Enable for Entire Tenant (Less Secure)**

1. Go to Microsoft 365 Admin Center → Exchange admin center
2. Navigate to **Settings** → **Mail flow**
3. Click **SMTP AUTH** settings
4. Enable SMTP AUTH for the entire organization (not recommended for security)

---

## 3. Authentication Method

### ✅ Choose Authentication Method

**If MFA (Multi-Factor Authentication) is Enabled:**

You **MUST** use an **App Password**:

1. Go to https://account.microsoft.com/security
2. Sign in with the `notification@egyptgoldpro.com` account
3. Navigate to **Security** → **Advanced security options**
4. Under **App passwords**, click **Create a new app password**
5. Name it: "EgyptGold Pro SMTP"
6. Copy the generated password (16 characters, spaces optional)
7. Use this password as `SMTP_PASS` in your environment variables

**If MFA is NOT Enabled:**

You can use the regular mailbox password:
- Use the mailbox password as `SMTP_PASS` in your environment variables

**Note:** If your tenant enforces MFA for all users, you must use App Passwords. Regular passwords will not work.

---

## 4. DNS Configuration

### ✅ SPF Record

Add an SPF record to your domain's DNS to authorize Microsoft 365 to send emails:

**Type:** TXT  
**Name:** `@` (or root domain)  
**Value:** `v=spf1 include:spf.protection.outlook.com -all`

**How to add:**
1. Log in to your DNS provider (e.g., GoDaddy, Cloudflare, Namecheap)
2. Add a new TXT record with the above value
3. Wait for DNS propagation (usually 5-60 minutes)

**Verify:**
```bash
nslookup -type=TXT egyptgoldpro.com
# Should show: v=spf1 include:spf.protection.outlook.com -all
```

---

### ✅ DKIM Records

Enable DKIM in Microsoft 365 and add the provided CNAME records:

1. **Enable DKIM in Microsoft 365:**
   - Go to Microsoft 365 Admin Center → Exchange admin center
   - Navigate to **Protection** → **dkim**
   - Select your domain (`egyptgoldpro.com`)
   - Click **Enable**
   - Microsoft will generate two CNAME records

2. **Add CNAME Records to DNS:**
   - Microsoft will provide two CNAME records like:
     - `selector1._domainkey.egyptgoldpro.com` → `selector1-egyptgoldpro-com._domainkey.outlook.com`
     - `selector2._domainkey.egyptgoldpro.com` → `selector2-egyptgoldpro-com._domainkey.outlook.com`
   - Add both CNAME records to your DNS provider
   - Wait for DNS propagation

**Verify:**
```bash
nslookup -type=CNAME selector1._domainkey.egyptgoldpro.com
nslookup -type=CNAME selector2._domainkey.egyptgoldpro.com
```

---

### ✅ DMARC Record (Optional but Recommended)

Add a DMARC record to monitor email authentication:

**Type:** TXT  
**Name:** `_dmarc`  
**Value:** `v=DMARC1; p=none; rua=mailto:dmarc@egyptgoldpro.com`

**How to add:**
1. Add a TXT record with name `_dmarc.egyptgoldpro.com`
2. Use the value above (start with `p=none` for monitoring, then change to `p=quarantine` or `p=reject` after verification)

**Verify:**
```bash
nslookup -type=TXT _dmarc.egyptgoldpro.com
```

---

## 5. Environment Variables

### ✅ Set in Vercel (or your hosting platform)

Add these environment variables:

```bash
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_USER=notification@egyptgoldpro.com
SMTP_PASS=your_app_password_or_mailbox_password
NOTIF_FROM_EMAIL=notification@egyptgoldpro.com
NOTIF_FROM_NAME=EgyptGold Pro
```

**Important:**
- `SMTP_PASS` should be the App Password if MFA is enabled, or the mailbox password if MFA is disabled
- Never commit these values to git
- Use Vercel's environment variables UI or CLI

---

## 6. Testing

### ✅ Test SMTP Connection

Use the test endpoint:

```bash
curl -X POST "https://egyptgoldpro.com/api/notifications/email/test?secret=YOUR_CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"email": "your-test-email@example.com"}'
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Test email sent successfully",
  "messageId": "..."
}
```

**If it fails:**
- Check server logs for detailed SMTP error messages
- Verify all environment variables are set correctly
- Ensure SMTP AUTH is enabled for the mailbox
- Verify DNS records are propagated (use `nslookup` or online DNS checkers)

---

## 7. Common Issues & Solutions

### ❌ "Authentication failed"

**Causes:**
- MFA is enabled but using regular password → Use App Password
- SMTP AUTH not enabled for mailbox → Enable in Exchange Admin Center
- Wrong username/password → Double-check credentials

**Solution:**
1. Verify SMTP AUTH is enabled for the mailbox
2. If MFA is enabled, generate and use an App Password
3. Test credentials by logging into Outlook with the same account

---

### ❌ "Connection timeout" or "Connection refused"

**Causes:**
- Firewall blocking port 587
- Wrong SMTP host/port

**Solution:**
- Verify `SMTP_HOST=smtp.office365.com` and `SMTP_PORT=587`
- Ensure your hosting provider allows outbound connections on port 587
- Try port 465 with `secure: true` (not recommended for Office365)

---

### ❌ "Emails going to spam"

**Causes:**
- Missing or incorrect SPF/DKIM/DMARC records
- Domain reputation issues

**Solution:**
1. Verify all DNS records are correct and propagated
2. Check SPF/DKIM/DMARC using online tools (e.g., MXToolbox, DMARC Analyzer)
3. Warm up the sending domain by sending a few test emails first
4. Monitor DMARC reports at `dmarc@egyptgoldpro.com`

---

### ❌ "Rate limiting" or "Too many emails"

**Causes:**
- Microsoft 365 has sending limits (typically 10,000 emails/day for Exchange Online)

**Solution:**
- Monitor email volume
- Consider upgrading to a higher plan if needed
- Implement rate limiting in your application

---

## 8. Security Best Practices

1. **Use App Passwords** if MFA is enabled (required)
2. **Never commit credentials** to version control
3. **Rotate passwords** periodically
4. **Monitor email delivery** logs for anomalies
5. **Use Shared Mailbox** if possible (no license cost, better for service accounts)
6. **Enable DMARC** with `p=quarantine` or `p=reject` after initial testing

---

## 9. Verification Checklist

Before going live, verify:

- [ ] Mailbox `notification@egyptgoldpro.com` exists and is accessible
- [ ] SMTP AUTH is enabled for the mailbox
- [ ] App Password created (if MFA enabled) or regular password works
- [ ] SPF record added and verified
- [ ] DKIM enabled and CNAME records added
- [ ] DMARC record added (optional but recommended)
- [ ] Environment variables set in Vercel/hosting platform
- [ ] Test email sent successfully via `/api/notifications/email/test`
- [ ] Test email received in inbox (not spam)
- [ ] DNS records verified using `nslookup` or online tools

---

## 10. Alternative: Microsoft Graph API

If SMTP continues to have issues, consider migrating to Microsoft Graph API:

**Advantages:**
- More reliable than SMTP
- Better rate limits
- OAuth2 authentication (more secure)
- Better error handling

**Disadvantages:**
- More complex setup
- Requires Azure AD app registration
- More code changes needed

**When to consider:**
- If SMTP AUTH is disabled by tenant policy
- If you need higher sending limits
- If you want more advanced features (read receipts, etc.)

---

## Support

If you encounter issues:

1. Check server logs for detailed SMTP error messages
2. Verify all DNS records using online tools
3. Test SMTP connection using a tool like `telnet smtp.office365.com 587`
4. Contact Microsoft 365 support if mailbox/SMTP AUTH issues persist

---

## Quick Reference

**SMTP Settings:**
- Host: `smtp.office365.com`
- Port: `587`
- Security: `STARTTLS` (secure: false)
- Username: `notification@egyptgoldpro.com`
- Password: App Password (if MFA) or mailbox password

**DNS Records:**
- SPF: `v=spf1 include:spf.protection.outlook.com -all`
- DKIM: Two CNAME records from Microsoft 365
- DMARC: `v=DMARC1; p=none; rua=mailto:dmarc@egyptgoldpro.com`

**Test Endpoint:**
- `POST /api/notifications/email/test?secret=CRON_SECRET`
- Body: `{ "email": "test@example.com" }`

