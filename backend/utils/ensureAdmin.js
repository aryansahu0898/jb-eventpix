/**
 * Admin user bootstrap helpers.
 */

const bcrypt = require('bcryptjs');

const User = require('../models/User');

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
 * Reads a required environment variable.
 * @param {string} name
 * @returns {string}
 */
function getRequiredEnv(name) {
  const value = readEnv(name);

  if (!value) {
    throw new Error(`${name} is required.`);
  }

  return value;
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
 * Returns whether all admin environment variables are present.
 * @returns {boolean}
 */
function hasAdminEnvironment() {
  return ['ADMIN_NAME', 'ADMIN_EMAIL', 'ADMIN_MOBILE', 'ADMIN_PASSWORD'].every(function hasValue(name) {
    return Boolean(readEnv(name));
  });
}

/**
 * Builds and validates the admin payload from environment variables.
 * @returns {{ name: string, email: string, mobile: string, password: string }}
 */
function buildAdminPayload() {
  const payload = {
    name: getRequiredEnv('ADMIN_NAME'),
    email: normalizeEmail(getRequiredEnv('ADMIN_EMAIL')),
    mobile: getRequiredEnv('ADMIN_MOBILE'),
    password: getRequiredEnv('ADMIN_PASSWORD')
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
 * Creates or updates an admin account using environment variables.
 * @param {{ required?: boolean }} [options]
 * @returns {Promise<{ skipped: boolean, created?: boolean, email?: string }>}
 */
async function ensureAdminFromEnv(options = {}) {
  const required = Boolean(options.required);

  if (!hasAdminEnvironment()) {
    if (required) {
      buildAdminPayload();
    }

    return { skipped: true };
  }

  const result = await upsertAdmin(buildAdminPayload());
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
