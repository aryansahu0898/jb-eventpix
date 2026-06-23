/**
 * api.js
 * ------
 * Shared frontend runtime for API requests, auth session storage, theme handling, and toasts.
 */

(function bootstrapJBApp() {
  const apiBaseMeta = document.querySelector('meta[name="api-base"]');
  const API_BASE = (apiBaseMeta && apiBaseMeta.content.trim()) || `${window.location.origin}/api`;
  const ACCESS_TOKEN_KEY = 'accessToken';
  const REFRESH_TOKEN_KEY = 'refreshToken';
  const USER_KEY = 'jbCurrentUser';
  const THEME_KEY = 'jbThemePreference';

  /**
   * Builds an API URL from a relative endpoint.
   * @param {string} endpoint
   * @returns {string}
   */
  function buildApiUrl(endpoint) {
    if (/^https?:\/\//i.test(endpoint)) {
      return endpoint;
    }

    return `${API_BASE}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
  }

  /**
   * Gets the stored access token.
   * @returns {string | null}
   */
  function getAccessToken() {
    return localStorage.getItem(ACCESS_TOKEN_KEY);
  }

  /**
   * Gets the stored refresh token.
   * @returns {string | null}
   */
  function getRefreshToken() {
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  }

  /**
   * Returns the currently stored user payload.
   * @returns {{ id: string, name: string, email: string, mobile?: string, role: string } | null}
   */
  function getCurrentUser() {
    const rawValue = localStorage.getItem(USER_KEY);

    if (!rawValue) {
      return null;
    }

    try {
      return JSON.parse(rawValue);
    } catch (error) {
      localStorage.removeItem(USER_KEY);
      return null;
    }
  }

  /**
   * Stores the current auth session.
   * @param {{ accessToken: string, refreshToken: string, user: object }} session
   * @returns {void}
   */
  function setSession(session) {
    localStorage.setItem(ACCESS_TOKEN_KEY, session.accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, session.refreshToken);
    localStorage.setItem(USER_KEY, JSON.stringify(session.user));
  }

  /**
   * Clears tokens and the current user from storage.
   * @returns {void}
   */
  function clearSession() {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }

  /**
   * Escapes plain text for safe HTML output.
   * @param {string} value
   * @returns {string}
   */
  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Parses a fetch response body into JSON or a plain object.
   * @param {Response} response
   * @returns {Promise<any>}
   */
  async function parseResponse(response) {
    const text = await response.text();

    if (!text) {
      return {};
    }

    try {
      return JSON.parse(text);
    } catch (error) {
      return { message: text };
    }
  }

  /**
   * Refreshes the access token using the stored refresh token.
   * @returns {Promise<boolean>}
   */
  async function refreshAccessToken() {
    const refreshToken = getRefreshToken();

    if (!refreshToken) {
      return false;
    }

    const response = await fetch(buildApiUrl('/auth/refresh'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ refreshToken })
    });

    if (!response.ok) {
      return false;
    }

    const data = await parseResponse(response);

    if (!data.accessToken) {
      return false;
    }

    localStorage.setItem(ACCESS_TOKEN_KEY, data.accessToken);
    return true;
  }

  /**
   * Executes an API request with automatic token refresh.
   * @param {string} endpoint
   * @param {RequestInit & { body?: any }} [options]
   * @param {boolean} [retryOn401]
   * @returns {Promise<any>}
   */
  async function request(endpoint, options = {}, retryOn401 = true) {
    const headers = new Headers(options.headers || {});
    const token = getAccessToken();
    const requestOptions = {
      method: options.method || 'GET',
      headers,
      body: options.body,
      credentials: 'include'
    };

    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    if (requestOptions.body && !(requestOptions.body instanceof FormData) && typeof requestOptions.body === 'object') {
      headers.set('Content-Type', 'application/json');
      requestOptions.body = JSON.stringify(requestOptions.body);
    }

    const response = await fetch(buildApiUrl(endpoint), requestOptions);

    if (response.status === 401 && retryOn401 && getRefreshToken()) {
      const refreshed = await refreshAccessToken();

      if (refreshed) {
        return request(endpoint, options, false);
      }

      clearSession();
      redirectToLogin();
      throw new Error('Your session has expired. Please sign in again.');
    }

    const data = await parseResponse(response);

    if (!response.ok) {
      throw new Error(data.message || 'The request could not be completed.');
    }

    return data;
  }

  /**
   * Uploads a FormData payload with progress callbacks and token refresh handling.
   * @param {string} endpoint
   * @param {FormData} formData
   * @param {(progress: number) => void} [onProgress]
   * @param {boolean} [retryOn401]
   * @returns {Promise<any>}
   */
  function uploadRequest(endpoint, formData, onProgress, retryOn401 = true) {
    return new Promise(function resolveUpload(resolve, reject) {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', buildApiUrl(endpoint), true);

      const token = getAccessToken();
      if (token) {
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      }

      xhr.upload.addEventListener('progress', function onUploadProgress(event) {
        if (!event.lengthComputable || typeof onProgress !== 'function') {
          return;
        }

        onProgress(Math.round((event.loaded / event.total) * 100));
      });

      xhr.addEventListener('load', async function onLoad() {
        let payload = {};

        try {
          payload = xhr.responseText ? JSON.parse(xhr.responseText) : {};
        } catch (error) {
          payload = { message: xhr.responseText };
        }

        if (xhr.status === 401 && retryOn401 && getRefreshToken()) {
          const refreshed = await refreshAccessToken();

          if (refreshed) {
            resolve(uploadRequest(endpoint, formData, onProgress, false));
            return;
          }

          clearSession();
          redirectToLogin();
          reject(new Error('Your session has expired. Please sign in again.'));
          return;
        }

        if (xhr.status < 200 || xhr.status >= 300) {
          reject(new Error(payload.message || 'Upload failed.'));
          return;
        }

        resolve(payload);
      });

      xhr.addEventListener('error', function onError() {
        reject(new Error('Network error while uploading files.'));
      });

      xhr.send(formData);
    });
  }

  /**
   * Returns the preferred theme based on storage or system settings.
   * @returns {'light' | 'dark'}
   */
  function getPreferredTheme() {
    const storedTheme = localStorage.getItem(THEME_KEY);

    if (storedTheme === 'light' || storedTheme === 'dark') {
      return storedTheme;
    }

    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  /**
   * Updates every theme toggle button label.
   * @returns {void}
   */
  function syncThemeToggleLabels() {
    const isDark = document.body.classList.contains('theme-dark');

    document.querySelectorAll('[data-theme-toggle]').forEach(function updateButton(button) {
      button.textContent = isDark ? 'Light mode' : 'Dark mode';
    });
  }

  /**
   * Applies the active color theme.
   * @param {'light' | 'dark'} theme
   * @param {boolean} [persist]
   * @returns {void}
   */
  function applyTheme(theme, persist = true) {
    const isDark = theme === 'dark';

    document.body.classList.toggle('theme-dark', isDark);
    document.body.classList.toggle('theme-light', !isDark);

    if (persist) {
      localStorage.setItem(THEME_KEY, theme);
    }

    syncThemeToggleLabels();
  }

  /**
   * Toggles between light and dark themes.
   * @returns {void}
   */
  function toggleTheme() {
    applyTheme(document.body.classList.contains('theme-dark') ? 'light' : 'dark');
  }

  /**
   * Initializes theme buttons on the page.
   * @returns {void}
   */
  function initThemeToggle() {
    applyTheme(getPreferredTheme(), false);

    document.querySelectorAll('[data-theme-toggle]').forEach(function bindButton(button) {
      if (button.dataset.boundTheme === 'true') {
        return;
      }

      button.dataset.boundTheme = 'true';
      button.addEventListener('click', toggleTheme);
    });
  }

  /**
   * Ensures a toast container exists.
   * @returns {HTMLElement}
   */
  function ensureToastStack() {
    let stack = document.querySelector('.toast-stack');

    if (!stack) {
      stack = document.createElement('div');
      stack.className = 'toast-stack';
      document.body.appendChild(stack);
    }

    return stack;
  }

  /**
   * Shows a temporary toast message.
   * @param {string} message
   * @param {'success' | 'error' | 'warning' | 'info'} [type]
   * @returns {void}
   */
  function showToast(message, type = 'info') {
    const stack = ensureToastStack();
    const toast = document.createElement('div');

    toast.className = 'toast';
    toast.dataset.type = type;
    toast.textContent = message;
    stack.appendChild(toast);

    window.setTimeout(function removeToast() {
      toast.remove();
    }, 3500);
  }

  /**
   * Formats a date in a readable locale style.
   * @param {string | Date} value
   * @returns {string}
   */
  function formatDate(value) {
    return new Date(value).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  /**
   * Redirects a user based on their role.
   * @param {{ role: string }} user
   * @returns {void}
   */
  function redirectByRole(user) {
    window.location.href = user.role === 'admin' ? '/pages/admin/dashboard.html' : '/pages/events.html';
  }

  /**
   * Redirects the browser to the login page.
   * @returns {void}
   */
  function redirectToLogin() {
    window.location.href = '/pages/login.html';
  }

  /**
   * Logs out the current browser session and redirects to login.
   * @returns {Promise<void>}
   */
  async function logout() {
    const refreshToken = getRefreshToken();

    try {
      if (refreshToken) {
        await request('/auth/logout', {
          method: 'POST',
          body: { refreshToken }
        }, false);
      }
    } catch (error) {
      // Local session cleanup should still happen if the server token is already expired.
    }

    clearSession();
    redirectToLogin();
  }

  /**
   * Shows and wires logout buttons when a user is signed in.
   * @returns {void}
   */
  function initLogoutButtons() {
    const hasSession = Boolean(getAccessToken() && getCurrentUser());

    document.querySelectorAll('[data-logout-button]').forEach(function bindLogoutButton(button) {
      button.classList.toggle('hidden', !hasSession);

      if (button.dataset.boundLogout === 'true') {
        return;
      }

      button.dataset.boundLogout = 'true';
      button.addEventListener('click', logout);
    });
  }

  /**
   * Initializes shared UI behavior once the document is ready.
   * @returns {void}
   */
  function initGlobalUi() {
    initThemeToggle();
    initLogoutButtons();
  }

  document.addEventListener('DOMContentLoaded', initGlobalUi);

  window.JBApp = {
    API_BASE,
    applyTheme,
    buildApiUrl,
    clearSession,
    escapeHtml,
    formatDate,
    getAccessToken,
    getCurrentUser,
    getRefreshToken,
    logout,
    redirectByRole,
    redirectToLogin,
    request,
    setSession,
    showToast,
    toggleTheme,
    uploadRequest
  };
})();
