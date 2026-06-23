/**
 * verifyEmail.js
 * --------------
 * Handles email verification links opened from the user's inbox.
 */

window.addEventListener('DOMContentLoaded', initVerifyEmailPage);

/**
 * Renders the verification status panel.
 * @param {'loading' | 'success' | 'error'} state
 * @param {string} title
 * @param {string} message
 * @returns {void}
 */
function renderVerificationState(state, title, message) {
  const panel = document.getElementById('verification-panel');
  const heading = document.getElementById('verification-title');
  const copy = document.getElementById('verification-message');
  const loader = document.getElementById('verification-loader');
  const action = document.getElementById('verification-action');

  panel.dataset.state = state;
  heading.textContent = title;
  copy.textContent = message;
  loader.classList.toggle('hidden', state !== 'loading');
  action.classList.toggle('hidden', state === 'loading');
}

/**
 * Verifies the token from the current URL.
 * @returns {Promise<void>}
 */
async function initVerifyEmailPage() {
  const token = new URLSearchParams(window.location.search).get('token');

  if (!token) {
    renderVerificationState('error', 'Verification link missing', 'Please open the complete link from your email inbox.');
    return;
  }

  try {
    const response = await window.JBApp.request('/auth/verify-email', {
      method: 'POST',
      body: { token }
    }, false);

    renderVerificationState('success', 'Email verified', response.message || 'Your account is verified. You can now sign in.');
  } catch (error) {
    renderVerificationState('error', 'Verification failed', error.message);
  }
}
