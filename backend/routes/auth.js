/**
 * Authentication routes.
 */

const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { body, validationResult } = require('express-validator');

const User = require('../models/User');
const { sendVerificationEmail } = require('../utils/email');

// Section: Router
const router = express.Router();

const RefreshToken = mongoose.models.RefreshToken || mongoose.model('RefreshToken', new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  token: {
    type: String,
    required: true,
    unique: true
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: '7d'
  }
}, {
  versionKey: false
}));

/**
 * Returns formatted validation errors when a request is invalid.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @returns {boolean}
 */
function sendValidationErrors(req, res) {
  const errors = validationResult(req);

  if (errors.isEmpty()) {
    return false;
  }

  res.status(400).json({
    message: 'Validation failed.',
    errors: errors.array()
  });
  return true;
}

/**
 * Hashes a verification token before storing it.
 * @param {string} token
 * @returns {string}
 */
function hashVerificationToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Creates a raw email token and its database-safe hash.
 * @returns {{ token: string, hashedToken: string, expiresAt: Date }}
 */
function createEmailVerificationToken() {
  const token = crypto.randomBytes(32).toString('hex');

  return {
    token,
    hashedToken: hashVerificationToken(token),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
  };
}

/**
 * Builds a signed access token for API requests.
 * @param {string} userId
 * @param {string} role
 * @returns {string}
 */
function createAccessToken(userId, role) {
  return jwt.sign({ id: userId, role }, process.env.JWT_ACCESS_SECRET, {
    expiresIn: '15m'
  });
}

/**
 * Builds a refresh token for session renewal.
 * @param {string} userId
 * @returns {string}
 */
function createRefreshToken(userId) {
  return jwt.sign({ id: userId }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: '7d'
  });
}

/**
 * Registers a new user account.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @returns {Promise<void>}
 */
async function registerUser(req, res) {
  if (sendValidationErrors(req, res)) {
    return;
  }

  const { name, email, mobile, password } = req.body;
  const existingUser = await User.findOne({ email }).lean();

  if (existingUser) {
    res.status(409).json({ message: 'An account already exists with this email address.' });
    return;
  }

  const hashedPassword = await bcrypt.hash(password, 12);
  const verification = createEmailVerificationToken();
  const user = await User.create({
    name,
    email,
    mobile,
    password: hashedPassword,
    isVerified: false,
    emailVerificationToken: verification.hashedToken,
    emailVerificationExpires: verification.expiresAt
  });

  try {
    await sendVerificationEmail(user, verification.token);
  } catch (error) {
    await User.findByIdAndDelete(user._id);
    throw error;
  }

  res.status(201).json({
    message: 'Registration successful. Please check your email to verify your account before signing in.',
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      mobile: user.mobile,
      role: user.role
    }
  });
}

/**
 * Logs a user in and stores a refresh token in MongoDB.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @returns {Promise<void>}
 */
async function loginUser(req, res) {
  if (sendValidationErrors(req, res)) {
    return;
  }

  const { email, password } = req.body;
  const user = await User.findOne({ email });

  if (!user) {
    res.status(401).json({ message: 'Invalid email or password.' });
    return;
  }

  const isMatch = await bcrypt.compare(password, user.password);

  if (!isMatch) {
    res.status(401).json({ message: 'Invalid email or password.' });
    return;
  }

  if (user.role !== 'admin' && !user.isVerified) {
    res.status(403).json({ message: 'Please verify your email address before signing in.' });
    return;
  }

  const accessToken = createAccessToken(String(user._id), user.role);
  const refreshToken = createRefreshToken(String(user._id));

  await RefreshToken.create({
    userId: user._id,
    token: refreshToken
  });

  res.json({
    accessToken,
    refreshToken,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      mobile: user.mobile,
      role: user.role
    }
  });
}

/**
 * Exchanges a refresh token for a new access token.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @returns {Promise<void>}
 */
async function refreshSession(req, res) {
  if (sendValidationErrors(req, res)) {
    return;
  }

  const { refreshToken } = req.body;
  const storedToken = await RefreshToken.findOne({ token: refreshToken }).lean();

  if (!storedToken) {
    res.status(403).json({ message: 'Refresh token is not valid.' });
    return;
  }

  try {
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const user = await User.findById(decoded.id).lean();

    if (!user) {
      await RefreshToken.deleteOne({ token: refreshToken });
      res.status(403).json({ message: 'Refresh token user no longer exists.' });
      return;
    }

    if (user.role !== 'admin' && !user.isVerified) {
      await RefreshToken.deleteOne({ token: refreshToken });
      res.status(403).json({ message: 'Please verify your email address before continuing.' });
      return;
    }

    res.json({
      accessToken: createAccessToken(String(user._id), user.role)
    });
  } catch (error) {
    await RefreshToken.deleteOne({ token: refreshToken });
    res.status(401).json({ message: 'Refresh token has expired or is invalid.' });
  }
}

/**
 * Logs the user out by deleting the refresh token document.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @returns {Promise<void>}
 */
async function logoutUser(req, res) {
  if (sendValidationErrors(req, res)) {
    return;
  }

  await RefreshToken.deleteOne({ token: req.body.refreshToken });
  res.json({ message: 'Logout successful.' });
}

/**
 * Verifies a user email address using a token from email.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @returns {Promise<void>}
 */
async function verifyEmail(req, res) {
  if (sendValidationErrors(req, res)) {
    return;
  }

  const hashedToken = hashVerificationToken(req.body.token);
  const user = await User.findOne({
    emailVerificationToken: hashedToken,
    emailVerificationExpires: { $gt: new Date() }
  });

  if (!user) {
    res.status(400).json({ message: 'Verification link is invalid or has expired.' });
    return;
  }

  user.isVerified = true;
  user.emailVerificationToken = '';
  user.emailVerificationExpires = null;

  await user.save();
  res.json({ message: 'Email verified successfully. You can now sign in.' });
}

/**
 * Sends a fresh verification email to an unverified account.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @returns {Promise<void>}
 */
async function resendVerificationEmail(req, res) {
  if (sendValidationErrors(req, res)) {
    return;
  }

  const user = await User.findOne({ email: req.body.email });

  if (!user || user.isVerified) {
    res.json({ message: 'If this email needs verification, a new verification link has been sent.' });
    return;
  }

  const verification = createEmailVerificationToken();
  user.emailVerificationToken = verification.hashedToken;
  user.emailVerificationExpires = verification.expiresAt;
  await user.save();

  await sendVerificationEmail(user, verification.token);
  res.json({ message: 'If this email needs verification, a new verification link has been sent.' });
}

router.post('/register', [
  body('name').trim().notEmpty().withMessage('Full name is required.').escape(),
  body('email').trim().isEmail().withMessage('A valid email is required.').normalizeEmail(),
  body('mobile').trim().matches(/^\d{10}$/).withMessage('Mobile number must contain 10 digits.'),
  body('password').trim().isLength({ min: 8 }).withMessage('Password must be at least 8 characters long.')
], function registerHandler(req, res, next) {
  registerUser(req, res).catch(next);
});

router.post('/login', [
  body('email').trim().isEmail().withMessage('A valid email is required.').normalizeEmail(),
  body('password').trim().notEmpty().withMessage('Password is required.')
], function loginHandler(req, res, next) {
  loginUser(req, res).catch(next);
});

router.post('/refresh', [
  body('refreshToken').trim().notEmpty().withMessage('Refresh token is required.')
], function refreshHandler(req, res, next) {
  refreshSession(req, res).catch(next);
});

router.post('/verify-email', [
  body('token').trim().isLength({ min: 32 }).withMessage('A valid verification token is required.')
], function verifyEmailHandler(req, res, next) {
  verifyEmail(req, res).catch(next);
});

router.post('/resend-verification', [
  body('email').trim().isEmail().withMessage('A valid email is required.').normalizeEmail()
], function resendVerificationHandler(req, res, next) {
  resendVerificationEmail(req, res).catch(next);
});

router.post('/logout', [
  body('refreshToken').trim().notEmpty().withMessage('Refresh token is required.')
], function logoutHandler(req, res, next) {
  logoutUser(req, res).catch(next);
});

module.exports = router;
