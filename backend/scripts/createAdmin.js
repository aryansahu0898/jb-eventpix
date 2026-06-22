/**
 * Admin account seed script.
 */

require('dotenv').config();

const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');

const connectDB = require('../config/db');
const User = require('../models/User');

// Section: Input Helpers
/**
 * Reads and trims a required environment variable.
 * @param {string} name
 * @returns {string}
 */
function getRequiredEnv(name) {
  const value = process.env[name];

  if (!value || !value.trim()) {
    throw new Error(`${name} is required.`);
  }

  return value.trim();
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

// Section: Database Work
/**
 * Creates or updates the configured admin account.
 * @param {{ name: string, email: string, mobile: string, password: string }} payload
 * @returns {Promise<{ created: boolean, user: import('mongoose').Document }>}
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
    return { created: false, user: existingUser };
  }

  const user = await User.create({
    name: payload.name,
    email: payload.email,
    mobile: payload.mobile,
    password: passwordHash,
    role: 'admin',
    isVerified: true
  });

  return { created: true, user };
}

/**
 * Runs the admin seed command.
 * @returns {Promise<void>}
 */
async function run() {
  await connectDB();

  const payload = buildAdminPayload();
  const result = await upsertAdmin(payload);
  const action = result.created ? 'Created' : 'Updated';

  console.log(`${action} admin account: ${payload.email}`);
  await mongoose.disconnect();
}

run().catch(async function handleSeedError(error) {
  console.error('Failed to create admin account:', error.message);
  await mongoose.disconnect().catch(function ignoreDisconnectError() {});
  process.exit(1);
});
