import nodemailer from 'nodemailer';

/**
 * Email service — all SMTP configuration is read from environment variables.
 * Credentials are never logged or returned to clients.
 */

interface InvitationEmailOptions {
  toEmail: string;
  toName: string;
  temporaryPassword: string;
}

interface EmailResult {
  sent: boolean;
  message?: string;
}

function createTransporter() {
  const host = process.env.EMAIL_HOST;
  const port = parseInt(process.env.EMAIL_PORT || '587', 10);
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASSWORD;

  if (!host || !user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

function buildInvitationHtml(name: string, email: string, temporaryPassword: string, loginUrl: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Welcome to Good Enough Energy EMS</title>
  <style>
    body { margin: 0; padding: 0; background: #f1f5f9; font-family: 'Helvetica Neue', Arial, sans-serif; color: #1e293b; }
    .wrapper { max-width: 560px; margin: 40px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.07); }
    .header { background: linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%); padding: 32px 40px; text-align: center; }
    .header h1 { margin: 0; color: #ffffff; font-size: 22px; font-weight: 700; letter-spacing: -0.3px; }
    .header p { margin: 6px 0 0; color: #94a3b8; font-size: 13px; }
    .body { padding: 36px 40px; }
    .greeting { font-size: 18px; font-weight: 600; margin-bottom: 12px; }
    .intro { font-size: 14px; line-height: 1.7; color: #475569; margin-bottom: 28px; }
    .field-block { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px 20px; margin-bottom: 12px; }
    .field-label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.6px; color: #94a3b8; margin-bottom: 4px; }
    .field-value { font-size: 15px; font-weight: 600; color: #1e293b; font-family: 'Courier New', monospace; word-break: break-all; }
    .cta { display: block; margin: 28px 0; text-align: center; }
    .cta a { background: #2563eb; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-size: 14px; font-weight: 600; display: inline-block; }
    .notice { background: #fef3c7; border: 1px solid #fcd34d; border-radius: 8px; padding: 14px 18px; font-size: 13px; color: #78350f; line-height: 1.6; margin-bottom: 24px; }
    .footer { border-top: 1px solid #f1f5f9; padding: 24px 40px; text-align: center; font-size: 12px; color: #94a3b8; line-height: 1.7; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <h1>Good Enough Energy EMS</h1>
      <p>Energy Management System</p>
    </div>
    <div class="body">
      <div class="greeting">Welcome, ${escapeHtml(name)} 👋</div>
      <p class="intro">
        Your EMS client account has been created. Use the credentials below to log in for the first time.
      </p>

      <div class="field-block">
        <div class="field-label">Login Email</div>
        <div class="field-value">${escapeHtml(email)}</div>
      </div>
      <div class="field-block">
        <div class="field-label">Temporary Password</div>
        <div class="field-value">${escapeHtml(temporaryPassword)}</div>
      </div>

      <div class="cta">
        <a href="${escapeHtml(loginUrl)}">Log In to EMS &rarr;</a>
      </div>

      <div class="notice">
        🔐 <strong>Action required:</strong> You will be prompted to set a new password immediately after your first login. Please do not share this temporary password with anyone.
      </div>
    </div>
    <div class="footer">
      &copy; ${new Date().getFullYear()} Good Enough Energy &mdash; All rights reserved.<br />
      If you did not expect this email, please contact your system administrator.
    </div>
  </div>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export const emailService = {
  /**
   * Send a client invitation email containing the temporary password.
   * Never throws — returns a result object so callers can decide how to proceed.
   */
  async sendInvitation(options: InvitationEmailOptions): Promise<EmailResult> {
    const transporter = createTransporter();

    if (!transporter) {
      console.warn('[Email Service] Email not configured (EMAIL_HOST/EMAIL_USER/EMAIL_PASSWORD missing). Skipping invitation send.');
      return { sent: false, message: 'Email service is not configured on this server.' };
    }

    const fromAddress = process.env.EMAIL_FROM || process.env.EMAIL_USER || 'noreply@goodenoughenergy.com';
    const loginUrl = `${(process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '')}/login`;

    const html = buildInvitationHtml(options.toName, options.toEmail, options.temporaryPassword, loginUrl);

    try {
      await transporter.sendMail({
        from: `"Good Enough Energy EMS" <${fromAddress}>`,
        to: options.toEmail,
        subject: 'Your EMS Account Invitation — Good Enough Energy',
        html,
        text: [
          `Welcome to Good Enough Energy EMS, ${options.toName}!`,
          '',
          `Login Email: ${options.toEmail}`,
          `Temporary Password: ${options.temporaryPassword}`,
          `Login URL: ${loginUrl}`,
          '',
          'You will be required to change your password on first login.',
          'Do not share your temporary password with anyone.',
          '',
          '— Good Enough Energy'
        ].join('\n'),
      });

      return { sent: true };
    } catch (err: any) {
      // Log the error type but never the password or SMTP credentials
      console.error('[Email Service] Failed to send invitation email:', err?.code || err?.message || 'Unknown error');
      return { sent: false, message: 'Invitation email could not be delivered. Please share the temporary password manually.' };
    }
  },
};
