/**
 * auth.js
 * -------
 * Authentication form validation, submission, and redirect handling.
 */

window.addEventListener('DOMContentLoaded', initAuthPage);

/**
 * Initializes the login or registration page.
 * @returns {void}
 */
function initAuthPage() {
  const form = document.querySelector('[data-auth-form]');

  if (!form) {
    return;
  }

  const mode = form.dataset.mode;

  bindFieldValidation(form, mode);
  bindForgotPassword();
  bindFixedAdminLogin(form, mode);
  form.addEventListener('submit', function onSubmit(event) {
    handleSubmit(event, form, mode).catch(function onError(error) {
      window.JBApp.showToast(error.message, 'error');
    });
  });
}

/**
 * Attaches real-time validation to auth form fields.
 * @param {HTMLFormElement} form
 * @param {'login' | 'register'} mode
 * @returns {void}
 */
function bindFieldValidation(form, mode) {
  form.querySelectorAll('[data-validate]').forEach(function bindInput(input) {
    ['input', 'blur'].forEach(function bindEventName(eventName) {
      input.addEventListener(eventName, function onFieldEvent() {
        validateField(input, form, mode);
      });
    });
  });
}

/**
 * Binds the fixed admin login helper button.
 * @param {HTMLFormElement} form
 * @param {'login' | 'register'} mode
 * @returns {void}
 */
function bindFixedAdminLogin(form, mode) {
  const button = document.querySelector('[data-fill-admin-login]');

  if (!button || mode !== 'login') {
    return;
  }

  button.addEventListener('click', function submitAdminCredentials() {
    const emailInput = form.querySelector('[name="email"]');
    const passwordInput = form.querySelector('[name="password"]');

    emailInput.value = button.dataset.adminEmail || 'admin@jbeventpix.com';
    passwordInput.value = button.dataset.adminPassword || 'Admin@12345';

    validateField(emailInput, form, mode);
    validateField(passwordInput, form, mode);
    window.JBApp.showToast('Signing in with the fixed admin account.', 'info');
    form.requestSubmit();
  });
}

/**
 * Shows a note for the forgot password link.
 * @returns {void}
 */
function bindForgotPassword() {
  const forgotPasswordLink = document.querySelector('[data-forgot-password]');

  if (!forgotPasswordLink) {
    return;
  }

  forgotPasswordLink.addEventListener('click', function onForgotPassword(event) {
    event.preventDefault();
    window.JBApp.showToast('Please contact an administrator to reset your password.', 'info');
  });
}

/**
 * Returns all form values as a plain object.
 * @param {HTMLFormElement} form
 * @returns {Record<string, string>}
 */
function getFormValues(form) {
  return Object.fromEntries(new FormData(form).entries());
}

/**
 * Returns the validation message for a given field.
 * @param {string} fieldName
 * @param {Record<string, string>} values
 * @param {'login' | 'register'} mode
 * @returns {string}
 */
function getValidationMessage(fieldName, values, mode) {
  if (fieldName === 'name' && mode === 'register') {
    return values.name.trim().length >= 2 ? '' : 'Please enter your full name.';
  }

  if (fieldName === 'email') {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim()) ? '' : 'Enter a valid email address.';
  }

  if (fieldName === 'mobile' && mode === 'register') {
    return /^\d{10}$/.test(values.mobile.trim()) ? '' : 'Mobile number must contain 10 digits.';
  }

  if (fieldName === 'password') {
    return values.password.length >= 8 ? '' : 'Password must be at least 8 characters long.';
  }

  if (fieldName === 'confirmPassword' && mode === 'register') {
    return values.confirmPassword === values.password ? '' : 'Passwords do not match.';
  }

  return '';
}

/**
 * Renders the field validation state.
 * @param {HTMLInputElement} input
 * @param {string} message
 * @returns {boolean}
 */
function renderFieldState(input, message) {
  const group = input.closest('.input-group');
  const hint = group ? group.querySelector('.field-message') : null;
  const hasValue = input.value.trim().length > 0;
  const isValid = !message && hasValue;

  input.classList.toggle('invalid', Boolean(message));
  input.classList.toggle('valid', isValid);

  if (hint) {
    hint.textContent = message || (isValid ? 'Looks good.' : '');
    hint.dataset.state = message ? 'error' : (isValid ? 'success' : '');
  }

  return !message;
}

/**
 * Validates a single auth field.
 * @param {HTMLInputElement} input
 * @param {HTMLFormElement} form
 * @param {'login' | 'register'} mode
 * @returns {boolean}
 */
function validateField(input, form, mode) {
  const values = getFormValues(form);
  const message = getValidationMessage(input.name, values, mode);
  return renderFieldState(input, message);
}

/**
 * Validates every field in the form.
 * @param {HTMLFormElement} form
 * @param {'login' | 'register'} mode
 * @returns {boolean}
 */
function validateForm(form, mode) {
  return Array.from(form.querySelectorAll('[data-validate]')).every(function validateInput(input) {
    return validateField(input, form, mode);
  });
}

/**
 * Handles authentication form submission.
 * @param {SubmitEvent} event
 * @param {HTMLFormElement} form
 * @param {'login' | 'register'} mode
 * @returns {Promise<void>}
 */
async function handleSubmit(event, form, mode) {
  event.preventDefault();

  if (!validateForm(form, mode)) {
    window.JBApp.showToast('Please correct the highlighted fields.', 'warning');
    return;
  }

  const values = getFormValues(form);
  const submitButton = form.querySelector('button[type="submit"]');
  const originalLabel = submitButton.textContent;

  submitButton.disabled = true;
  submitButton.textContent = mode === 'register' ? 'Creating account...' : 'Signing in...';

  try {
    if (mode === 'register') {
      await window.JBApp.request('/auth/register', {
        method: 'POST',
        body: {
          name: values.name.trim(),
          email: values.email.trim(),
          mobile: values.mobile.trim(),
          password: values.password
        }
      });

      window.JBApp.showToast('Registration successful. Please sign in.', 'success');
      window.setTimeout(function redirectToLogin() {
        window.location.href = '/pages/login.html';
      }, 700);
      return;
    }

    const session = await window.JBApp.request('/auth/login', {
      method: 'POST',
      body: {
        email: values.email.trim(),
        password: values.password
      }
    });

    window.JBApp.setSession(session);
    window.JBApp.showToast('Signed in successfully.', 'success');
    window.setTimeout(function redirectUser() {
      window.JBApp.redirectByRole(session.user);
    }, 350);
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = originalLabel;
  }
}
