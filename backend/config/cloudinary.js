/**
 * Cloudinary configuration and helpers.
 */

const fs = require('fs/promises');
const path = require('path');
const cloudinary = require('cloudinary').v2;

// Section: Storage Mode
const storageProvider = process.env.STORAGE_PROVIDER || 'cloudinary';
const localUploadRoot = path.join(__dirname, '../uploads');
const isLocalStorage = storageProvider === 'local';

// Section: Base Configuration
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true
});

/**
 * Normalizes public ids so they are safe for local filesystem storage.
 * @param {string} value
 * @returns {string}
 */
function sanitizePublicId(value) {
  return value
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean)
    .map(function sanitizePart(part) {
      return part.replace(/[^a-z0-9_.-]+/gi, '-');
    })
    .join('/');
}

/**
 * Writes an image buffer to local disk for offline testing.
 * @param {Buffer} buffer
 * @param {import('cloudinary').UploadApiOptions} options
 * @returns {Promise<{ public_id: string, secure_url: string }>}
 */
async function uploadLocalBuffer(buffer, options = {}) {
  const folder = sanitizePublicId(options.folder || 'jb-function-capture');
  const rawPublicId = sanitizePublicId(options.public_id || `${Date.now()}-image`);
  const extension = String(options.format || path.extname(rawPublicId).slice(1) || 'jpg').replace(/^\./, '');
  const publicId = rawPublicId.endsWith(`.${extension}`) ? rawPublicId : `${rawPublicId}.${extension}`;
  const relativePath = path.join(folder, publicId);
  const absolutePath = path.join(localUploadRoot, relativePath);

  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, buffer);

  return {
    public_id: relativePath.replace(/\\/g, '/'),
    secure_url: `/uploads/${relativePath.replace(/\\/g, '/')}`
  };
}

/**
 * Uploads an image buffer to the configured storage provider.
 * @param {Buffer} buffer
 * @param {import('cloudinary').UploadApiOptions} [options]
 * @returns {Promise<import('cloudinary').UploadApiResponse | { public_id: string, secure_url: string }>}
 */
function uploadBuffer(buffer, options = {}) {
  if (isLocalStorage) {
    return uploadLocalBuffer(buffer, options);
  }

  return new Promise(function resolveUpload(resolve, reject) {
    const uploadStream = cloudinary.uploader.upload_stream({
      folder: 'jb-function-capture',
      resource_type: 'image',
      type: 'authenticated',
      access_mode: 'authenticated',
      ...options
    }, function onUploadComplete(error, result) {
      if (error) {
        reject(error);
        return;
      }

      resolve(result);
    });

    uploadStream.end(buffer);
  });
}

/**
 * Creates an optimized delivery URL for the configured storage provider.
 * @param {string} publicId
 * @param {number} width
 * @returns {string}
 */
function buildOptimizedImageUrl(publicId, width) {
  if (isLocalStorage) {
    return `/uploads/${publicId}`;
  }

  return cloudinary.url(publicId, {
    secure: true,
    sign_url: true,
    type: 'authenticated',
    fetch_format: 'auto',
    quality: 'auto',
    width,
    crop: 'limit'
  });
}

/**
 * Tries to derive a storage public id from a delivery URL.
 * @param {string} url
 * @returns {string | null}
 */
function extractPublicId(url) {
  if (!url) {
    return null;
  }

  if (isLocalStorage) {
    const parsedLocal = url.match(/\/uploads\/(.+)$/);
    return parsedLocal ? parsedLocal[1].split('?')[0] : null;
  }

  const parsed = url.match(/\/image\/(?:upload|authenticated|private)\/(.+)/);

  if (!parsed) {
    return null;
  }

  let publicPath = parsed[1].split('?')[0];
  publicPath = publicPath.replace(/^s--[^/]+--\//, '');
  publicPath = publicPath.replace(/^v\d+\//, '');

  const extension = path.extname(publicPath);
  return extension ? publicPath.slice(0, -extension.length) : publicPath;
}

/**
 * Deletes an asset when a public id is available.
 * @param {string | null | undefined} publicId
 * @returns {Promise<void>}
 */
async function deleteAsset(publicId) {
  if (!publicId) {
    return;
  }

  if (isLocalStorage) {
    await fs.rm(path.join(localUploadRoot, publicId), { force: true });
    return;
  }

  await cloudinary.uploader.destroy(publicId, {
    resource_type: 'image',
    type: 'authenticated',
    invalidate: true
  });
}

module.exports = {
  cloudinary,
  uploadBuffer,
  buildOptimizedImageUrl,
  extractPublicId,
  deleteAsset,
  isLocalStorage,
  localUploadRoot
};
