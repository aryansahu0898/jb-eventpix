/**
 * Upload middleware.
 */

const multer = require('multer');
const path = require('path');

// Section: Configuration
const storage = multer.memoryStorage();
const allowedImageExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif']);
const allowedImageMimeTypes = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif'
]);

/**
 * Validates that uploaded files are supported images.
 * @param {import('express').Request} req
 * @param {Express.Multer.File} file
 * @param {(error: Error | null, acceptFile?: boolean) => void} callback
 * @returns {void}
 */
function imageFileFilter(req, file, callback) {
  const extension = path.extname(file.originalname || '').toLowerCase();
  const isImage = allowedImageMimeTypes.has(String(file.mimetype).toLowerCase()) || allowedImageExtensions.has(extension);

  if (!isImage) {
    callback(new Error('Only JPG, PNG, WEBP, HEIC, and HEIF image files are supported.'));
    return;
  }

  callback(null, true);
}

/**
 * Multer instance for bulk image uploads.
 */
const upload = multer({
  storage,
  fileFilter: imageFileFilter,
  limits: {
    fileSize: 30 * 1024 * 1024,
    files: 20
  }
});

module.exports = upload;
