/**
 * J.B. EventPix server entry point.
 */

require('dotenv').config();

const cors = require('cors');
const express = require('express');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const rateLimit = require('express-rate-limit');

const connectDB = require('./config/db');
const { localUploadRoot } = require('./config/cloudinary');
const adminRoutes = require('./routes/admin');
const authRoutes = require('./routes/auth');
const eventRoutes = require('./routes/events');
const faceMatchRoutes = require('./routes/faceMatch');
const imageRoutes = require('./routes/images');

// Section: App Setup
const app = express();
const frontendDirectory = path.join(__dirname, '../frontend');
const allowedOrigins = (process.env.FRONTEND_URL || '')
  .split(',')
  .map(function normalizeOrigin(origin) {
    return origin.trim();
  })
  .filter(Boolean);

/**
 * Checks whether the request comes from a localhost development origin.
 * @param {string} origin
 * @returns {boolean}
 */
function isLocalDevelopmentOrigin(origin) {
  if (process.env.NODE_ENV === 'production') {
    return false;
  }

  try {
    const parsedOrigin = new URL(origin);
    return ['localhost', '127.0.0.1', '::1'].includes(parsedOrigin.hostname);
  } catch (error) {
    return false;
  }
}

/**
 * Checks whether a request origin is allowed.
 * @param {string | undefined} origin
 * @param {(error: Error | null, allow?: boolean) => void} callback
 * @returns {void}
 */
function validateCorsOrigin(origin, callback) {
  if (!origin || allowedOrigins.includes(origin) || isLocalDevelopmentOrigin(origin)) {
    callback(null, true);
    return;
  }

  const corsError = new Error('Origin not allowed by CORS.');
  corsError.statusCode = 403;
  callback(corsError);
}

/**
 * Handles application errors in a consistent format.
 * @param {Error & { statusCode?: number }} error
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 * @returns {void}
 */
function handleApplicationError(error, req, res, next) {
  void next;
  const statusCode = error.statusCode || 500;

  if (process.env.NODE_ENV !== 'test') {
    console.error(error);
  }

  res.status(statusCode).json({
    message: error.message || 'Internal server error.'
  });
}

/**
 * Starts the HTTP server after MongoDB is connected.
 * @returns {Promise<void>}
 */
async function startServer() {
  await connectDB();

  app.use(cors({
    origin: validateCorsOrigin,
    credentials: true
  }));
  app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' }
  }));
  app.use(morgan('dev'));
  app.use(express.json({ limit: '15mb' }));
  app.use(express.urlencoded({ extended: true, limit: '15mb' }));

  app.use('/api/auth', rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many authentication attempts. Please try again later.' }
  }));

  app.get('/api/health', function healthCheck(req, res) {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/events', eventRoutes);
  app.use('/api/images', imageRoutes);
  app.use('/api/face-match', faceMatchRoutes);

  app.use('/uploads', express.static(localUploadRoot));
  app.use(express.static(frontendDirectory));

  app.get('/', function sendHomepage(req, res) {
    res.sendFile(path.join(frontendDirectory, 'pages/index.html'));
  });

  app.use(function handleNotFound(req, res) {
    res.status(404).json({ message: 'Route not found.' });
  });

  app.use(handleApplicationError);

  const port = Number(process.env.PORT) || 5000;
  app.listen(port, function onListen() {
    console.log(`J.B. EventPix API running on port ${port}`);
  });
}

startServer().catch(function onStartupError(error) {
  console.error('Failed to start server:', error);
  process.exit(1);
});
