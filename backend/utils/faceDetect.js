/**
 * Server-side face detection helpers.
 */

const fs = require('fs');
const path = require('path');
const tf = require('@tensorflow/tfjs');
const wasm = require('@tensorflow/tfjs-backend-wasm');
const canvas = require('canvas');
const faceapi = require('@vladmandic/face-api/dist/face-api.node-wasm.js');

const { Canvas, Image, ImageData } = canvas;

// Section: Runtime Setup
faceapi.env.monkeyPatch({ Canvas, Image, ImageData });

const localModelPath = process.env.FACE_MODEL_PATH || path.join(__dirname, '../../frontend/assets/models');
const remoteModelPath = process.env.FACE_MODEL_REMOTE_URL || 'https://justadudewhohacks.github.io/face-api.js/models';
const wasmBinaryDirectory = path.dirname(require.resolve('@tensorflow/tfjs-backend-wasm/dist/tfjs-backend-wasm.wasm'));
let modelsLoaded = false;
let modelLoadPromise = null;
let backendReady = false;

/**
 * Returns local TensorFlow WASM binary paths so server face detection works offline.
 * @returns {{ [fileName: string]: string }}
 */
function getLocalWasmFileMap() {
  return {
    'tfjs-backend-wasm.wasm': path.join(wasmBinaryDirectory, 'tfjs-backend-wasm.wasm'),
    'tfjs-backend-wasm-simd.wasm': path.join(wasmBinaryDirectory, 'tfjs-backend-wasm-simd.wasm'),
    'tfjs-backend-wasm-threaded-simd.wasm': path.join(wasmBinaryDirectory, 'tfjs-backend-wasm-threaded-simd.wasm')
  };
}

/**
 * Initializes the TensorFlow WASM backend for Node.js face processing.
 * @returns {Promise<void>}
 */
async function ensureBackendReady() {
  if (backendReady) {
    return;
  }

  wasm.setWasmPaths(getLocalWasmFileMap());
  await tf.setBackend('wasm');
  await tf.ready();
  backendReady = true;
}

/**
 * Returns the list of required server-side model manifest files.
 * @returns {string[]}
 */
function getRequiredModelFiles() {
  return [
    'ssd_mobilenetv1_model-weights_manifest.json',
    'face_landmark_68_model-weights_manifest.json',
    'face_recognition_model-weights_manifest.json'
  ];
}

/**
 * Returns whether all required local model files exist.
 * @returns {boolean}
 */
function hasLocalModelFiles() {
  return getRequiredModelFiles().every(function hasFile(fileName) {
    return fs.existsSync(path.join(localModelPath, fileName));
  });
}

/**
 * Checks that the required server-side model files exist.
 * @returns {void}
 */
function assertModelFilesExist() {
  const missingFiles = getRequiredModelFiles().filter(function findMissing(fileName) {
    return !fs.existsSync(path.join(localModelPath, fileName));
  });

  if (missingFiles.length > 0) {
    throw new Error(`Missing face-api model files in ${localModelPath}: ${missingFiles.join(', ')}`);
  }
}

/**
 * Loads server-side face-api models once per process.
 * @returns {Promise<void>}
 */
async function loadModels() {
  if (modelsLoaded) {
    return;
  }

  if (!modelLoadPromise) {
    modelLoadPromise = (async function loadAllModels() {
      await ensureBackendReady();

      if (hasLocalModelFiles()) {
        await faceapi.nets.ssdMobilenetv1.loadFromDisk(localModelPath);
        await faceapi.nets.faceLandmark68Net.loadFromDisk(localModelPath);
        await faceapi.nets.faceRecognitionNet.loadFromDisk(localModelPath);
        modelsLoaded = true;
        return;
      }

      try {
        await faceapi.nets.ssdMobilenetv1.loadFromUri(remoteModelPath);
        await faceapi.nets.faceLandmark68Net.loadFromUri(remoteModelPath);
        await faceapi.nets.faceRecognitionNet.loadFromUri(remoteModelPath);
      } catch (error) {
        assertModelFilesExist();
        throw error;
      }

      modelsLoaded = true;
    })();
  }

  await modelLoadPromise;
}

/**
 * Converts a detection box into a plain JSON object.
 * @param {import('@vladmandic/face-api').Box} box
 * @returns {{ x: number, y: number, width: number, height: number }}
 */
function toBoundingBox(box) {
  return {
    x: Number(box.x),
    y: Number(box.y),
    width: Number(box.width),
    height: Number(box.height)
  };
}

/**
 * Detects all faces and descriptors in an image buffer.
 * @param {Buffer} imageBuffer
 * @returns {Promise<Array<{ descriptor: number[], boundingBox: { x: number, y: number, width: number, height: number } }>>}
 */
async function detectFaces(imageBuffer) {
  await loadModels();

  const image = await canvas.loadImage(imageBuffer);
  const detections = await faceapi
    .detectAllFaces(image, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
    .withFaceLandmarks()
    .withFaceDescriptors();

  return detections.map(function mapDetection(detection) {
    return {
      descriptor: Array.from(detection.descriptor),
      boundingBox: toBoundingBox(detection.detection.box)
    };
  });
}

module.exports = detectFaces;
