/**
 * Email delivery helpers.
 */

const nodemailer = require('nodemailer');

// Section: Environment
/**
 * Reads and trims an environment variable.
 * @param {string} name
 * @returns {string}
 */
function readEnv(name) {
  return (process.env[name] || '').trim();
}

/**
 * Parses boolean-like environment values.
 * @param {string} value
 * @returns {boolean}
 */
function parseBoolean(value) {
  return ['true', '1', 'yes'].includes(String(value).toLowerCase());
}

/**
 * Returns the public base URL used in email links.
 * @returns {string}
 */
function getPublicBaseUrl() {
  const configuredUrl = readEnv('PUBLIC_BASE_URL') || readEnv('FRONTEND_URL') || `http://localhost:${process.env.PORT || 5000}`;
  return configuredUrl.replace(/\/+$/, '');
}

/**
 * Checks whether SMTP delivery is configured.
 * @returns {boolean}
 */
function isEmailConfigured() {
  return Boolean(readEnv('EMAIL_HOST') && readEnv('EMAIL_PORT') && readEnv('EMAIL_USER') && readEnv('EMAIL_PASS'));
}

/**
 * Creates a Nodemailer transport from environment variables.
 * @returns {import('nodemailer').Transporter}
 */
function createTransporter() {
  return nodemailer.createTransport({
    host: readEnv('EMAIL_HOST'),
    port: Number(readEnv('EMAIL_PORT')),
    secure: parseBoolean(readEnv('EMAIL_SECURE')),
    auth: {
      user: readEnv('EMAIL_USER'),
      pass: readEnv('EMAIL_PASS')
    }
  });
}

/**
 * Builds the email verification URL.
 * @param {string} token
 * @returns {string}
 */
function buildVerificationLink(token) {
  return `${getPublicBaseUrl()}/pages/verify-email.html?token=${encodeURIComponent(token)}`;
}

/**
 * Escapes user-provided text for email HTML.
 * @param {string} value
 * @returns {string}
 */
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Sends an account verification email.
 * @param {{ name: string, email: string }} user
 * @param {string} token
 * @returns {Promise<{ skipped: boolean }>}
 */
async function sendVerificationEmail(user, token) {
  const verificationLink = buildVerificationLink(token);
  const safeName = escapeHtml(user.name);

  if (!isEmailConfigured()) {
    if (process.env.NODE_ENV === 'production') {
      const error = new Error('Email service is not configured. Add EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASS, and EMAIL_FROM in Render.');
      error.statusCode = 500;
      throw error;
    }

    console.log(`Email verification link for ${user.email}: ${verificationLink}`);
    return { skipped: true };
  }

  const transporter = createTransporter();
  const from = readEnv('EMAIL_FROM') || `J.B. EventPix <${readEnv('EMAIL_USER')}>`;

  await transporter.sendMail({
    from,
    to: user.email,
    subject: 'Verify your J.B. EventPix account',
    text: [
      `Hello ${user.name},`,
      '',
      'Please verify your J.B. EventPix account using this link:',
      verificationLink,
      '',
      'This link expires in 24 hours.'
    ].join('\n'),
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1a1a1a;">
        <h2 style="color: #E51F2F;">Verify your J.B. EventPix account</h2>
        <p>Hello ${safeName},</p>
        <p>Please verify your account before signing in.</p>
        <p>
          <a href="${verificationLink}" style="display: inline-block; padding: 12px 18px; background: #E51F2F; color: #ffffff; text-decoration: none; border-radius: 10px;">
            Verify Account
          </a>
        </p>
        <p>This link expires in 24 hours.</p>
      </div>
    `
  });

  return { skipped: false };
}

module.exports = {
  buildVerificationLink,
  isEmailConfigured,
  sendVerificationEmail
};
