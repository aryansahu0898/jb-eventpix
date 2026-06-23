/**
 * Image routes.
 */

const express = require('express');
const mongoose = require('mongoose');
const { param, query, validationResult } = require('express-validator');

const adminOnly = require('../middleware/adminOnly');
const { verifyToken } = require('../middleware/auth');
const upload = require('../middleware/upload');
const { uploadBuffer, buildOptimizedImageUrl, deleteAsset } = require('../config/cloudinary');
const Event = require('../models/Event');
const FaceData = require('../models/FaceData');
const Image = require('../models/Image');
const detectFaces = require('../utils/faceDetect');

// Section: Router
const router = express.Router();
const faceDetectionTimeoutMs = Number(process.env.FACE_DETECTION_TIMEOUT_MS) || 25000;

/**
 * Gets a safe image format from an uploaded filename or mimetype.
 * @param {Express.Multer.File} file
 * @returns {string}
 */
function getImageFormat(file) {
  const extension = file.originalname.split('.').pop();

  if (extension && /^[a-z0-9]+$/i.test(extension)) {
    return extension.toLowerCase() === 'jpeg' ? 'jpg' : extension.toLowerCase();
  }

  return file.mimetype.split('/').pop() || 'jpg';
}

/**
 * Sends validation errors if the request is invalid.
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
 * Runs face detection with a timeout.
 * @param {Buffer} imageBuffer
 * @returns {Promise<Array<{ descriptor: number[], boundingBox: { x: number, y: number, width: number, height: number } }>>}
 */
async function detectFacesWithTimeout(imageBuffer) {
  let timeoutId;

  try {
    return await Promise.race([
      detectFaces(imageBuffer),
      new Promise(function rejectAfterTimeout(resolve, reject) {
        void resolve;
        timeoutId = setTimeout(function onTimeout() {
          reject(new Error(`Face detection timed out after ${faceDetectionTimeoutMs}ms.`));
        }, faceDetectionTimeoutMs);
      })
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

/**
 * Runs face detection without blocking the image upload.
 * @param {Buffer} imageBuffer
 * @param {string} originalName
 * @returns {Promise<{ detections: Array<{ descriptor: number[], boundingBox: { x: number, y: number, width: number, height: number } }>, warning: string }>}
 */
async function detectFacesSafely(imageBuffer, originalName) {
  try {
    return {
      detections: await detectFacesWithTimeout(imageBuffer),
      warning: ''
    };
  } catch (error) {
    console.error(`Face detection failed for ${originalName}:`, error.message);
    return {
      detections: [],
      warning: 'Image uploaded, but face detection failed. Check Render logs for model or canvas errors.'
    };
  }
}

/**
 * Uploads a single image, then runs face detection and stores descriptors when available.
 * @param {string} eventId
 * @param {Express.Multer.File} file
 * @returns {Promise<{ imageId: string, faceCount: number, url: string, thumbnailUrl: string, originalName: string, warning?: string }>}
 */
async function processUploadedImage(eventId, file) {
  const uploadResult = await uploadBuffer(file.buffer, {
    folder: `jb-function-capture/events/${eventId}`,
    public_id: `${Date.now()}-${file.originalname.replace(/\.[^.]+$/, '').replace(/[^a-z0-9_-]+/gi, '-')}`,
    format: getImageFormat(file)
  });
  const detectionResult = await detectFacesSafely(file.buffer, file.originalname);
  const detections = detectionResult.detections;

  const image = await Image.create({
    eventId,
    url: buildOptimizedImageUrl(uploadResult.public_id, 1600),
    publicId: uploadResult.public_id,
    thumbnailUrl: buildOptimizedImageUrl(uploadResult.public_id, 800),
    faceCount: detections.length,
    faceEmbeddings: detections.map(function mapDetection(detection) {
      return {
        descriptor: detection.descriptor,
        boundingBox: detection.boundingBox
      };
    })
  });

  if (detections.length > 0) {
    await FaceData.insertMany(detections.map(function mapFace(detection) {
      return {
        imageId: image._id,
        eventId,
        descriptor: detection.descriptor,
        boundingBox: detection.boundingBox
      };
    }));
  }

  return {
    imageId: String(image._id),
    faceCount: detections.length,
    url: image.url,
    thumbnailUrl: image.thumbnailUrl,
    originalName: file.originalname,
    warning: detectionResult.warning || undefined
  };
}

/**
 * Handles bulk event image uploads.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @returns {Promise<void>}
 */
async function uploadEventImages(req, res) {
  if (sendValidationErrors(req, res)) {
    return;
  }

  const files = req.files || [];
  if (files.length === 0) {
    res.status(400).json({ message: 'At least one image must be uploaded.' });
    return;
  }

  const event = await Event.findById(req.params.eventId);

  if (!event) {
    res.status(404).json({ message: 'Event not found.' });
    return;
  }

  const uploaded = [];
  const warnings = [];
  for (const file of files) {
    const result = await processUploadedImage(String(event._id), file);
    uploaded.push(result);

    if (result.warning) {
      warnings.push(`${result.originalName}: ${result.warning}`);
    }
  }

  event.imageCount += uploaded.length;
  await event.save();

  res.status(201).json({
    message: 'Images uploaded successfully.',
    uploaded,
    warnings
  });
}

/**
 * Lists event images with optional pagination.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @returns {Promise<void>}
 */
async function getEventImages(req, res) {
  if (sendValidationErrors(req, res)) {
    return;
  }

  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 100);
  const skip = (page - 1) * limit;

  const [images, total] = await Promise.all([
    Image.find({ eventId: req.params.eventId })
      .sort({ uploadedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Image.countDocuments({ eventId: req.params.eventId })
  ]);

  res.json({
    images,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit)
  });
}

/**
 * Deletes an image and all related face records.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @returns {Promise<void>}
 */
async function deleteImage(req, res) {
  if (sendValidationErrors(req, res)) {
    return;
  }

  const image = await Image.findById(req.params.imageId);

  if (!image) {
    res.status(404).json({ message: 'Image not found.' });
    return;
  }

  await Promise.all([
    deleteAsset(image.publicId),
    FaceData.deleteMany({ imageId: image._id }),
    Image.findByIdAndDelete(image._id)
  ]);

  await Event.findByIdAndUpdate(image.eventId, {
    $inc: { imageCount: -1 }
  });

  res.json({ message: 'Image deleted successfully.' });
}

router.post('/upload/:eventId', verifyToken, adminOnly, [
  param('eventId').custom(function validateEventId(value) {
    return mongoose.Types.ObjectId.isValid(value);
  }).withMessage('A valid event id is required.')
], upload.array('images', 20), function uploadImagesHandler(req, res, next) {
  uploadEventImages(req, res).catch(next);
});

router.get('/:eventId', [
  param('eventId').custom(function validateEventId(value) {
    return mongoose.Types.ObjectId.isValid(value);
  }).withMessage('A valid event id is required.'),
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer.'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100.')
], function getImagesHandler(req, res, next) {
  getEventImages(req, res).catch(next);
});

router.delete('/:imageId', verifyToken, adminOnly, [
  param('imageId').custom(function validateImageId(value) {
    return mongoose.Types.ObjectId.isValid(value);
  }).withMessage('A valid image id is required.')
], function deleteImageHandler(req, res, next) {
  deleteImage(req, res).catch(next);
});

module.exports = router;
