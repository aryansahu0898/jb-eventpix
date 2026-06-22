/**
 * admin.js
 * --------
 * Admin dashboard data loading, event CRUD, chart rendering, and upload progress handling.
 */

const dashboardState = {
  events: [],
  charts: {
    distribution: null,
    recent: null
  }
};

window.addEventListener('DOMContentLoaded', initDashboardPage);

/**
 * Initializes the admin dashboard page.
 * @returns {void}
 */
function initDashboardPage() {
  if (!window.location.pathname.includes('/pages/admin/dashboard.html')) {
    return;
  }

  const user = window.JBApp.getCurrentUser();
  if (!user || user.role !== 'admin') {
    window.JBApp.redirectToLogin();
    return;
  }

  setAdminName(user);
  bindDashboardEvents();
  loadDashboardData().catch(function onError(error) {
    window.JBApp.showToast(error.message, 'error');
  });
}

/**
 * Sets the admin name in the navbar.
 * @param {{ name: string }} user
 * @returns {void}
 */
function setAdminName(user) {
  const nameElement = document.getElementById('admin-name');

  if (nameElement) {
    nameElement.textContent = user.name;
  }
}

/**
 * Binds all dashboard UI events.
 * @returns {void}
 */
function bindDashboardEvents() {
  document.getElementById('logout-btn').addEventListener('click', handleLogout);
  document.getElementById('open-event-modal').addEventListener('click', function openCreateModal() {
    openEventModal();
  });
  document.getElementById('close-event-modal').addEventListener('click', closeEventModal);
  document.getElementById('event-modal').addEventListener('click', function onBackdropClick(event) {
    if (event.target.id === 'event-modal') {
      closeEventModal();
    }
  });
  document.getElementById('event-form').addEventListener('submit', function onFormSubmit(event) {
    handleEventFormSubmit(event).catch(function onError(error) {
      window.JBApp.showToast(error.message, 'error');
    });
  });
  document.getElementById('events-table-body').addEventListener('click', handleEventTableClick);
  document.getElementById('upload-drop-zone').addEventListener('click', function openFilePicker() {
    document.getElementById('upload-input').click();
  });
  document.getElementById('upload-input').addEventListener('change', function onInputChange(event) {
    handleFileSelection(event.target.files).catch(function onError(error) {
      window.JBApp.showToast(error.message, 'error');
    });
    event.target.value = '';
  });
  bindDropZone();
}

/**
 * Loads dashboard stats and event listings.
 * @returns {Promise<void>}
 */
async function loadDashboardData() {
  const [stats, eventResponse] = await Promise.all([
    window.JBApp.request('/admin/dashboard'),
    window.JBApp.request('/events?page=1&limit=100')
  ]);

  dashboardState.events = eventResponse.events || [];
  renderMetrics(stats);
  renderEventsTable(dashboardState.events);
  populateUploadEventSelect(dashboardState.events);
  renderCharts(dashboardState.events);
}

/**
 * Renders dashboard metric cards.
 * @param {{ totalUsers: number, totalEvents: number, totalImages: number, totalFaces: number }} stats
 * @returns {void}
 */
function renderMetrics(stats) {
  document.getElementById('stat-users').textContent = String(stats.totalUsers || 0);
  document.getElementById('stat-events').textContent = String(stats.totalEvents || 0);
  document.getElementById('stat-images').textContent = String(stats.totalImages || 0);
  document.getElementById('stat-faces').textContent = String(stats.totalFaces || 0);
}

/**
 * Renders the dashboard events table.
 * @param {Array<any>} events
 * @returns {void}
 */
function renderEventsTable(events) {
  const tableBody = document.getElementById('events-table-body');

  if (events.length === 0) {
    tableBody.innerHTML = '<tr><td colspan="5">No events created yet.</td></tr>';
    return;
  }

  tableBody.innerHTML = events.map(function createRow(event) {
    return `
      <tr>
        <td>
          <strong>${window.JBApp.escapeHtml(event.name)}</strong>
          <div class="text-muted">${window.JBApp.escapeHtml(event.description || 'No description')}</div>
        </td>
        <td>${window.JBApp.formatDate(event.date)}</td>
        <td>${event.imageCount || 0}</td>
        <td>${event.coverImage ? 'Cloudinary' : 'Not set'}</td>
        <td>
          <div class="event-actions">
            <button class="mini-btn" data-action="upload" data-id="${event._id}">Upload photos</button>
            <button class="mini-btn" data-action="edit" data-id="${event._id}">Edit</button>
            <button class="mini-btn" data-action="delete" data-id="${event._id}">Delete</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

/**
 * Populates the upload event selector.
 * @param {Array<any>} events
 * @returns {void}
 */
function populateUploadEventSelect(events) {
  const select = document.getElementById('upload-event-id');
  const previousValue = select.value;

  select.innerHTML = `
    <option value="">Select an event</option>
    ${events.map(function createOption(event) {
      return `<option value="${event._id}">${window.JBApp.escapeHtml(event.name)} (${event.imageCount || 0} photos)</option>`;
    }).join('')}
  `;

  if (previousValue && events.some(function hasEvent(event) { return event._id === previousValue; })) {
    select.value = previousValue;
  }
}

/**
 * Renders both dashboard charts.
 * @param {Array<any>} events
 * @returns {void}
 */
function renderCharts(events) {
  const chartLabels = events.map(function mapLabel(event) {
    return event.name;
  });
  const imageCounts = events.map(function mapCount(event) {
    return event.imageCount || 0;
  });
  const distributionContext = document.getElementById('event-distribution-chart');
  const recentContext = document.getElementById('recent-images-chart');
  const recentEvents = [...events].sort(function sortRecent(a, b) {
    return new Date(b.date) - new Date(a.date);
  }).slice(0, 6).reverse();

  if (!window.Chart) {
    renderChartFallback(distributionContext, 'Charts are unavailable offline. Dashboard data and uploads still work.');
    renderChartFallback(recentContext, 'Charts are unavailable offline. Event data is shown in the table below.');
    return;
  }

  if (dashboardState.charts.distribution) {
    dashboardState.charts.distribution.destroy();
  }
  if (dashboardState.charts.recent) {
    dashboardState.charts.recent.destroy();
  }

  dashboardState.charts.distribution = new Chart(distributionContext, {
    type: 'doughnut',
    data: {
      labels: chartLabels,
      datasets: [{
        data: imageCounts,
        backgroundColor: ['#E51F2F', '#FF6B78', '#B80F1D', '#FF9AA4', '#D7192A', '#FFE7EA'],
        borderWidth: 0
      }]
    },
    options: {
      plugins: {
        legend: {
          position: 'bottom'
        }
      }
    }
  });

  dashboardState.charts.recent = new Chart(recentContext, {
    type: 'bar',
    data: {
      labels: recentEvents.map(function mapEvent(event) { return event.name; }),
      datasets: [{
        label: 'Images',
        data: recentEvents.map(function mapEventCount(event) { return event.imageCount || 0; }),
        backgroundColor: '#E51F2F',
        borderRadius: 10
      }]
    },
    options: {
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            precision: 0
          }
        }
      },
      plugins: {
        legend: {
          display: false
        }
      }
    }
  });
}

/**
 * Replaces a chart canvas with a readable offline fallback.
 * @param {HTMLCanvasElement} canvas
 * @param {string} message
 * @returns {void}
 */
function renderChartFallback(canvas, message) {
  const card = canvas.closest('.chart-card');

  canvas.classList.add('hidden');

  if (card && !card.querySelector('.chart-fallback')) {
    const fallback = document.createElement('p');
    fallback.className = 'text-muted chart-fallback';
    fallback.textContent = message;
    card.appendChild(fallback);
  }
}

/**
 * Opens the event modal for create or edit mode.
 * @param {any} [eventRecord]
 * @returns {void}
 */
function openEventModal(eventRecord) {
  const modal = document.getElementById('event-modal');
  const form = document.getElementById('event-form');
  const title = document.getElementById('event-modal-title');
  const submitButton = document.getElementById('event-submit-btn');

  form.reset();
  form.dataset.editingId = eventRecord ? eventRecord._id : '';
  title.textContent = eventRecord ? 'Edit Event' : 'Create Event';
  submitButton.textContent = eventRecord ? 'Save Changes' : 'Create Event';
  document.getElementById('cover-preview-name').textContent = eventRecord && eventRecord.coverImage
    ? 'Current cover image will remain unless you upload a new file.'
    : 'Upload a cover image for the event.';

  if (eventRecord) {
    document.getElementById('event-name').value = eventRecord.name || '';
    document.getElementById('event-date').value = new Date(eventRecord.date).toISOString().split('T')[0];
    document.getElementById('event-description').value = eventRecord.description || '';
  }

  modal.classList.remove('hidden');
}

/**
 * Closes the event modal.
 * @returns {void}
 */
function closeEventModal() {
  document.getElementById('event-modal').classList.add('hidden');
}

/**
 * Reads a file as a data URL.
 * @param {File} file
 * @returns {Promise<string>}
 */
function readFileAsDataUrl(file) {
  return new Promise(function resolveFile(resolve, reject) {
    const reader = new FileReader();

    reader.onload = function onLoad() {
      resolve(String(reader.result));
    };
    reader.onerror = function onError() {
      reject(new Error('Unable to read the selected image file.'));
    };

    reader.readAsDataURL(file);
  });
}

/**
 * Submits the event create or update form.
 * @param {SubmitEvent} event
 * @returns {Promise<void>}
 */
async function handleEventFormSubmit(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const submitButton = document.getElementById('event-submit-btn');
  const coverFile = document.getElementById('event-cover').files[0];
  const isEdit = Boolean(form.dataset.editingId);
  const payload = {
    name: document.getElementById('event-name').value.trim(),
    date: document.getElementById('event-date').value,
    description: document.getElementById('event-description').value.trim()
  };

  if (!payload.name || !payload.date) {
    window.JBApp.showToast('Event name and date are required.', 'warning');
    return;
  }

  if (!isEdit && !coverFile) {
    window.JBApp.showToast('Please upload a cover image.', 'warning');
    return;
  }

  if (coverFile) {
    payload.coverImage = await readFileAsDataUrl(coverFile);
  }

  submitButton.disabled = true;
  submitButton.textContent = isEdit ? 'Saving...' : 'Creating...';

  try {
    await window.JBApp.request(isEdit ? `/events/${form.dataset.editingId}` : '/events', {
      method: isEdit ? 'PUT' : 'POST',
      body: payload
    });

    closeEventModal();
    window.JBApp.showToast(isEdit ? 'Event updated successfully.' : 'Event created successfully.', 'success');
    await loadDashboardData();
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = isEdit ? 'Save Changes' : 'Create Event';
  }
}

/**
 * Handles clicks in the events table.
 * @param {MouseEvent} event
 * @returns {void}
 */
function handleEventTableClick(event) {
  const button = event.target.closest('[data-action]');

  if (!button) {
    return;
  }

  const action = button.dataset.action;
  const eventId = button.dataset.id;
  const eventRecord = dashboardState.events.find(function findEvent(record) {
    return record._id === eventId;
  });

  if (!eventRecord) {
    return;
  }

  if (action === 'edit') {
    openEventModal(eventRecord);
    return;
  }

  if (action === 'upload') {
    document.getElementById('upload-event-id').value = eventRecord._id;
    document.getElementById('upload-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.JBApp.showToast(`Ready to upload images for ${eventRecord.name}.`, 'info');
    return;
  }

  if (action === 'delete') {
    handleDeleteEvent(eventRecord).catch(function onError(error) {
      window.JBApp.showToast(error.message, 'error');
    });
  }
}

/**
 * Deletes an event after confirmation.
 * @param {any} eventRecord
 * @returns {Promise<void>}
 */
async function handleDeleteEvent(eventRecord) {
  if (!window.confirm(`Delete "${eventRecord.name}" and all related photos?`)) {
    return;
  }

  await window.JBApp.request(`/events/${eventRecord._id}`, {
    method: 'DELETE'
  });

  window.JBApp.showToast('Event deleted successfully.', 'success');
  await loadDashboardData();
}

/**
 * Adds drag and drop behavior to the upload zone.
 * @returns {void}
 */
function bindDropZone() {
  const dropZone = document.getElementById('upload-drop-zone');

  ['dragenter', 'dragover'].forEach(function bindEvent(eventName) {
    dropZone.addEventListener(eventName, function onDrag(event) {
      event.preventDefault();
      dropZone.classList.add('dragover');
    });
  });

  ['dragleave', 'drop'].forEach(function bindEvent(eventName) {
    dropZone.addEventListener(eventName, function onDragLeave(event) {
      event.preventDefault();
      dropZone.classList.remove('dragover');
    });
  });

  dropZone.addEventListener('drop', function onDrop(event) {
    const files = event.dataTransfer ? event.dataTransfer.files : null;

    handleFileSelection(files).catch(function onError(error) {
      window.JBApp.showToast(error.message, 'error');
    });
  });
}

/**
 * Handles selected files from the file input or drop zone.
 * @param {FileList | null} files
 * @returns {Promise<void>}
 */
async function handleFileSelection(files) {
  const eventId = document.getElementById('upload-event-id').value;

  if (!eventId) {
    window.JBApp.showToast('Select an event before uploading photos.', 'warning');
    return;
  }

  if (!files || files.length === 0) {
    return;
  }

  const fileArray = Array.from(files).slice(0, 20);

  for (const file of fileArray) {
    const item = createUploadItem(file.name);
    document.getElementById('upload-list').prepend(item);
    await uploadSingleFile(eventId, file, item);
  }

  await loadDashboardData();
}

/**
 * Creates an upload list item element.
 * @param {string} fileName
 * @returns {HTMLElement}
 */
function createUploadItem(fileName) {
  const item = document.createElement('div');
  item.className = 'upload-item';
  item.innerHTML = `
    <div class="upload-item-head">
      <div>
        <div class="upload-file-name">${window.JBApp.escapeHtml(fileName)}</div>
        <div class="upload-status" data-upload-status>Queued</div>
      </div>
      <div class="status-pill" data-upload-progress>0%</div>
    </div>
    <div class="progress-bar"><span data-progress-fill></span></div>
  `;
  return item;
}

/**
 * Updates the upload progress UI.
 * @param {HTMLElement} item
 * @param {number} progress
 * @param {string} status
 * @returns {void}
 */
function updateUploadItem(item, progress, status) {
  item.querySelector('[data-progress-fill]').style.width = `${progress}%`;
  item.querySelector('[data-upload-progress]').textContent = `${progress}%`;
  item.querySelector('[data-upload-status]').textContent = status;
}

/**
 * Uploads a single file to the selected event.
 * @param {string} eventId
 * @param {File} file
 * @param {HTMLElement} item
 * @returns {Promise<void>}
 */
async function uploadSingleFile(eventId, file, item) {
  const formData = new FormData();
  formData.append('images', file);
  updateUploadItem(item, 0, 'Uploading...');

  const response = await window.JBApp.uploadRequest(`/images/upload/${eventId}`, formData, function onProgress(progress) {
    updateUploadItem(item, progress, 'Uploading...');
  });

  const uploadedImage = response.uploaded && response.uploaded[0];
  updateUploadItem(item, 100, uploadedImage ? `Completed. Detected ${uploadedImage.faceCount} face(s).` : 'Completed.');
}

/**
 * Logs the admin out and clears local auth state.
 * @returns {Promise<void>}
 */
async function handleLogout() {
  const refreshToken = window.JBApp.getRefreshToken();

  try {
    if (refreshToken) {
      await window.JBApp.request('/auth/logout', {
        method: 'POST',
        body: { refreshToken }
      });
    }
  } catch (error) {
    // The local session is still cleared even if the logout request fails.
  }

  window.JBApp.clearSession();
  window.location.href = '/pages/login.html';
}
