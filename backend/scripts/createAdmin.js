/**
 * Admin account seed script.
 */

require('dotenv').config();

const mongoose = require('mongoose');

const connectDB = require('../config/db');
const { ensureAdminFromEnv } = require('../utils/ensureAdmin');

/**
 * Runs the admin seed command.
 * @returns {Promise<void>}
 */
async function run() {
  await connectDB();

  const result = await ensureAdminFromEnv({ required: true });
  const action = result.created ? 'Created' : 'Updated';

  console.log(`${action} admin account: ${result.email}`);
  await mongoose.disconnect();
}

run().catch(async function handleSeedError(error) {
  console.error('Failed to create admin account:', error.message);
  await mongoose.disconnect().catch(function ignoreDisconnectError() {});
  process.exit(1);
});
