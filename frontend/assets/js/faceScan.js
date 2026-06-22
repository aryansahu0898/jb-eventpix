/**
 * faceScan.js
 * -----------
 * Camera and upload-based face capture with browser-side face-api.js detection and search submission.
 */

const MODEL_SOURCES = [
  '/assets/models',
  'https://justadudewhohacks.github.io/face-api.js/models'
];

const scanState = {
  activeTab: 'camera',
  eventId: '',
  eventName: 'Selected Event',
  currentDescriptor: null,
  cameraStream: null,
  cameraTimer: null,
  modelsReady: false,
  modelLoadPromise: null
};

window.addEventListener('DOMContentLoaded', initFaceScanPage);
window.addEventListener('beforeunload', stopCamera);

/**
 * Initializes the face scan page.
 * @returns {void}
 */
async function initFaceScanPage() {
  if (!window.location.pathname.includes('/pages/face-scan.html')) {
    return;
  }

  const eventContext = await resolveEventContext();

  if (!eventContext.eventId) {
    window.JBApp.showToast('Please select an event first.', 'warning');
    window.location.href = '/pages/events.html';
    return;
  }

  scanState.eventId = eventContext.eventId;
  scanState.eventName = eventContext.eventName;
  document.getElementById('scan-event-name').textContent = scanState.eventName;

  bindTabs();
  bindUploadZone();
  document.getElementById('camera-search-btn').addEventListener('click', function onCameraSearch() {
    handleSearchSubmission().catch(handleScanError);
  });
  document.getElementById('upload-search-btn').addEventListener('click', function onUploadSearch() {
    handleSearchSubmission().catch(handleScanError);
  });

  try {
    await loadModels();
    await startCamera();
  } catch (error) {
    handleScanError(error);
  }
}

/**
 * Resolves the current event id and event name from the query string.
 * @returns {Promise<{ eventId: string, eventName: string }>}
 */
async function resolveEventContext() {
  const params = new URLSearchParams(window.location.search);
  const eventId = params.get('eventId') || '';
  let eventName = params.get('eventName') || '';

  if (eventId && !eventName) {
    const response = await window.JBApp.request('/events?page=1&limit=100');
    const eventRecord = (response.events || []).find(function matchEvent(event) {
      return event._id === eventId;
    });

    eventName = eventRecord ? eventRecord.name : 'Selected Event';
  }

  return {
    eventId,
    eventName: eventName || 'Selected Event'
  };
}

/**
 * Loads browser face-api models with a local-first fallback strategy.
 * @returns {Promise<void>}
 */
async function loadModels() {
  if (scanState.modelsReady) {
    return;
  }

  if (!window.faceapi) {
    throw new Error('face-api.js failed to load. Please check the local vendor bundle.');
  }

  if (!scanState.modelLoadPromise) {
    scanState.modelLoadPromise = (async function loadOnce() {
      let lastError = null;

      for (const source of MODEL_SOURCES) {
        try {
          await Promise.all([
            faceapi.nets.tinyFaceDetector.loadFromUri(source),
            faceapi.nets.ssdMobilenetv1.loadFromUri(source),
            faceapi.nets.faceLandmark68TinyNet.loadFromUri(source),
            faceapi.nets.faceRecognitionNet.loadFromUri(source)
          ]);

          scanState.modelsReady = true;
          return;
        } catch (error) {
          lastError = error;
        }
      }

      throw lastError || new Error('Unable to load face detection models.');
    })();
  }

  await scanState.modelLoadPromise;
}

/**
 * Binds scan tab switching.
 * @returns {void}
 */
function bindTabs() {
  document.querySelectorAll('[data-scan-tab]').forEach(function bindTab(button) {
    button.addEventListener('click', function onClick() {
      switchTab(button.dataset.scanTab);
    });
  });
}

/**
 * Switches between camera and upload tabs.
 * @param {'camera' | 'upload'} tab
 * @returns {void}
 */
function switchTab(tab) {
  scanState.activeTab = tab;
  scanState.currentDescriptor = null;
  document.querySelectorAll('[data-scan-tab]').forEach(function updateButton(button) {
    button.classList.toggle('active', button.dataset.scanTab === tab);
  });
  document.querySelectorAll('[data-scan-panel]').forEach(function updatePanel(panel) {
    panel.classList.toggle('hidden', panel.dataset.scanPanel !== tab);
  });

  if (tab === 'camera') {
    startCamera().catch(handleScanError);
  } else {
    stopCamera();
  }

  setDetectionStatus('Awaiting a single clear face.');
}

/**
 * Starts the user's camera and begins lightweight face detection.
 * @returns {Promise<void>}
 */
async function startCamera() {
  const video = document.getElementById('camera-video');

  if (scanState.cameraStream) {
    return;
  }

  if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
    throw new Error('This browser does not support camera access for live scanning.');
  }

  scanState.cameraStream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: 'user',
      width: { ideal: 1280 },
      height: { ideal: 720 }
    },
    audio: false
  });

  video.srcObject = scanState.cameraStream;
  await video.play();
  startCameraDetectionLoop();
}

/**
 * Stops any running camera tracks and timers.
 * @returns {void}
 */
function stopCamera() {
  if (scanState.cameraTimer) {
    window.clearInterval(scanState.cameraTimer);
    scanState.cameraTimer = null;
  }

  if (scanState.cameraStream) {
    scanState.cameraStream.getTracks().forEach(function stopTrack(track) {
      track.stop();
    });
    scanState.cameraStream = null;
  }
}

/**
 * Starts polling the camera stream for face detections.
 * @returns {void}
 */
function startCameraDetectionLoop() {
  if (scanState.cameraTimer) {
    window.clearInterval(scanState.cameraTimer);
  }

  scanState.cameraTimer = window.setInterval(function detectCameraFrame() {
    detectCameraFace().catch(handleScanError);
  }, 450);
}

/**
 * Detects a face in the live camera feed using TinyFaceDetector.
 * @returns {Promise<void>}
 */
async function detectCameraFace() {
  const video = document.getElementById('camera-video');
  const overlay = document.getElementById('camera-overlay');

  if (video.readyState < 2) {
    return;
  }

  const detections = await faceapi
    .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 }))
    .withFaceLandmarks(true)
    .withFaceDescriptors();

  renderDetections(overlay, video, detections);
  cacheDescriptorFromDetections(detections);
}

/**
 * Binds drag and drop plus file selection for upload scanning.
 * @returns {void}
 */
function bindUploadZone() {
  const uploadZone = document.getElementById('upload-zone');
  const uploadInput = document.getElementById('upload-input');

  uploadZone.addEventListener('click', function onZoneClick() {
    uploadInput.click();
  });
  uploadInput.addEventListener('change', function onChange(event) {
    handleUploadedFile(event.target.files && event.target.files[0]).catch(handleScanError);
  });

  ['dragenter', 'dragover'].forEach(function bindDrag(eventName) {
    uploadZone.addEventListener(eventName, function onDrag(event) {
      event.preventDefault();
      uploadZone.classList.add('dragover');
    });
  });

  ['dragleave', 'drop'].forEach(function bindLeave(eventName) {
    uploadZone.addEventListener(eventName, function onLeave(event) {
      event.preventDefault();
      uploadZone.classList.remove('dragover');
    });
  });

  uploadZone.addEventListener('drop', function onDrop(event) {
    const file = event.dataTransfer && event.dataTransfer.files ? event.dataTransfer.files[0] : null;
    handleUploadedFile(file).catch(handleScanError);
  });
}

/**
 * Detects a face from an uploaded image using SSD Mobilenet.
 * @param {File | null} file
 * @returns {Promise<void>}
 */
async function handleUploadedFile(file) {
  if (!file) {
    return;
  }

  const previewImage = document.getElementById('upload-preview-image');
  const overlay = document.getElementById('upload-overlay');
  const objectUrl = URL.createObjectURL(file);

  previewImage.src = objectUrl;
  previewImage.classList.remove('hidden');
  document.getElementById('upload-placeholder').classList.add('hidden');
  await waitForImage(previewImage);

  const detections = await faceapi
    .detectAllFaces(previewImage, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
    .withFaceLandmarks(true)
    .withFaceDescriptors();

  renderDetections(overlay, previewImage, detections);
  cacheDescriptorFromDetections(detections);
  URL.revokeObjectURL(objectUrl);
}

/**
 * Waits for an image element to finish loading.
 * @param {HTMLImageElement} image
 * @returns {Promise<void>}
 */
function waitForImage(image) {
  return new Promise(function resolveImage(resolve, reject) {
    if (image.complete && image.naturalWidth > 0) {
      resolve();
      return;
    }

    image.onload = function onLoad() {
      resolve();
    };
    image.onerror = function onError() {
      reject(new Error('Unable to load the selected image.'));
    };
  });
}

/**
 * Renders detection boxes and confidence labels on a canvas overlay.
 * @param {HTMLCanvasElement} canvas
 * @param {HTMLVideoElement | HTMLImageElement} media
 * @param {Array<any>} detections
 * @returns {void}
 */
function renderDetections(canvas, media, detections) {
  const displaySize = {
    width: media.clientWidth || media.videoWidth || media.naturalWidth,
    height: media.clientHeight || media.videoHeight || media.naturalHeight
  };
  const resizedDetections = faceapi.resizeResults(detections, displaySize);
  const context = canvas.getContext('2d');

  canvas.width = displaySize.width;
  canvas.height = displaySize.height;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.lineWidth = 2;
  context.font = '600 14px Manrope';

  resizedDetections.forEach(function drawDetection(detection, index) {
    const box = detection.detection.box;
    const score = Math.round(detection.detection.score * 100);

    context.strokeStyle = '#E51F2F';
    context.fillStyle = 'rgba(229, 31, 47, 0.16)';
    context.strokeRect(box.x, box.y, box.width, box.height);
    context.fillRect(box.x, box.y - 28, 96, 24);
    context.fillStyle = '#1A1A1A';
    context.fillText(`${score}% clear`, box.x + 8, box.y - 10);

    if (index === 0) {
      setDetectionStatus(`${resizedDetections.length} face(s) detected with ${score}% confidence.`);
    }
  });

  if (resizedDetections.length === 0) {
    setDetectionStatus('No face detected yet.');
  }
}

/**
 * Stores the current descriptor only when exactly one face is visible.
 * @param {Array<any>} detections
 * @returns {void}
 */
function cacheDescriptorFromDetections(detections) {
  if (detections.length !== 1) {
    scanState.currentDescriptor = null;

    if (detections.length > 1) {
      setDetectionStatus('Multiple faces detected. Use a photo with one clear face.');
    }

    return;
  }

  scanState.currentDescriptor = Array.from(detections[0].descriptor);
}

/**
 * Updates the scan status label.
 * @param {string} message
 * @returns {void}
 */
function setDetectionStatus(message) {
  document.getElementById('scan-status').textContent = message;
}

/**
 * Submits the current descriptor to the backend face match API.
 * @returns {Promise<void>}
 */
async function handleSearchSubmission() {
  if (!scanState.currentDescriptor) {
    window.JBApp.showToast('Please capture a single clear face before searching.', 'warning');
    return;
  }

  setLoading(true);

  try {
    const response = await window.JBApp.request('/face-match/match', {
      method: 'POST',
      body: {
        eventId: scanState.eventId,
        descriptor: scanState.currentDescriptor
      }
    });

    sessionStorage.setItem('faceMatchResults', JSON.stringify({
      eventId: scanState.eventId,
      eventName: scanState.eventName,
      matches: response.matches || []
    }));

    window.location.href = `/pages/results.html?eventId=${encodeURIComponent(scanState.eventId)}&eventName=${encodeURIComponent(scanState.eventName)}`;
  } finally {
    setLoading(false);
  }
}

/**
 * Shows or hides the matching overlay.
 * @param {boolean} isLoading
 * @returns {void}
 */
function setLoading(isLoading) {
  document.getElementById('match-overlay').classList.toggle('hidden', !isLoading);
}

/**
 * Handles scan page errors with a toast and status update.
 * @param {Error} error
 * @returns {void}
 */
function handleScanError(error) {
  setDetectionStatus(error.message);
  window.JBApp.showToast(error.message, 'error');
}
