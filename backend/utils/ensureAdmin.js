/**
 * Admin user bootstrap helpers.
 */

const bcrypt = require('bcryptjs');

const User = require('../models/User');

// Section: Fixed Admin Defaults
const DEFAULT_ADMIN = Object.freeze({
  name: 'J.B. EventPix Admin',
  email: 'admin@jbeventpix.com',
  mobile: '9999999999'
});

// Section: Environment Helpers
/**
 * Reads and trims an environment variable.
 * @param {string} name
 * @returns {string}
 */
function readEnv(name) {
  return (process.env[name] || '').trim();
}

/**
 * Reads an environment variable, falling back to the fixed admin default.
 * @param {string} name
 * @param {string} fallback
 * @returns {string}
 */
function readEnvOrDefault(name, fallback) {
  const value = readEnv(name);
  return value || fallback;
}

/**
 * Normalizes an email address for database lookup.
 * @param {string} email
 * @returns {string}
 */
function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

/**
 * Returns the configured admin password.
 * @param {boolean} required
 * @returns {string}
 */
function getAdminPassword(required) {
  const password = readEnv('ADMIN_PASSWORD');

  if (password) {
    return password;
  }

  if (process.env.NODE_ENV !== 'production') {
    return 'Admin@12345';
  }

  if (required) {
    throw new Error('ADMIN_PASSWORD is required to create the production admin account.');
  }

  return '';
}

/**
 * Builds and validates the fixed admin payload, allowing env vars to override defaults.
 * @param {{ required?: boolean }} [options]
 * @returns {{ name: string, email: string, mobile: string, password: string }}
 */
function buildAdminPayload(options = {}) {
  const payload = {
    name: readEnvOrDefault('ADMIN_NAME', DEFAULT_ADMIN.name),
    email: normalizeEmail(readEnvOrDefault('ADMIN_EMAIL', DEFAULT_ADMIN.email)),
    mobile: readEnvOrDefault('ADMIN_MOBILE', DEFAULT_ADMIN.mobile),
    password: getAdminPassword(Boolean(options.required))
  };

  if (!/^\S+@\S+\.\S+$/.test(payload.email)) {
    throw new Error('ADMIN_EMAIL must be a valid email address.');
  }

  if (!/^\d{10}$/.test(payload.mobile)) {
    throw new Error('ADMIN_MOBILE must be exactly 10 digits.');
  }

  if (payload.password.length < 8) {
    throw new Error('ADMIN_PASSWORD must be at least 8 characters.');
  }

  return payload;
}

// Section: Admin Upsert
/**
 * Creates or updates an admin account.
 * @param {{ name: string, email: string, mobile: string, password: string }} payload
 * @returns {Promise<{ created: boolean, email: string }>}
 */
async function upsertAdmin(payload) {
  const passwordHash = await bcrypt.hash(payload.password, 12);
  const existingUser = await User.findOne({ email: payload.email });

  if (existingUser) {
    existingUser.name = payload.name;
    existingUser.mobile = payload.mobile;
    existingUser.password = passwordHash;
    existingUser.role = 'admin';
    existingUser.isVerified = true;

    await existingUser.save();
    return { created: false, email: payload.email };
  }

  await User.create({
    name: payload.name,
    email: payload.email,
    mobile: payload.mobile,
    password: passwordHash,
    role: 'admin',
    isVerified: true
  });

  return { created: true, email: payload.email };
}

/**
 * Creates or updates the fixed admin account during startup.
 * @param {{ required?: boolean }} [options]
 * @returns {Promise<{ skipped: boolean, created?: boolean, email?: string }>}
 */
async function ensureAdminFromEnv(options = {}) {
  if (!getAdminPassword(Boolean(options.required))) {
    return {
      skipped: true,
      reason: 'ADMIN_PASSWORD is not configured.'
    };
  }

  const result = await upsertAdmin(buildAdminPayload(options));
  return {
    skipped: false,
    created: result.created,
    email: result.email
  };
}

module.exports = {
  ensureAdminFromEnv,
  upsertAdmin,
  buildAdminPayload
};
