# Offline Local Test Guide

This guide runs J.B. EventPix on your own computer first. In this mode, uploaded photos are saved in `backend/uploads`, so Cloudinary is not required.

## Requirements

- Node.js `22.x` recommended, or any Node.js `>=18 <25`
- MongoDB running locally
- A modern browser

Camera access normally works on `localhost`. If your browser blocks the camera, use the upload-photo scan tab.

## Offline Feature Notes

- Cloudinary is not required when `STORAGE_PROVIDER=local`.
- Browser face scanning uses the local bundle at `frontend/assets/vendor/face-api.js`.
- Server face detection uses local TensorFlow WASM files from `backend/node_modules`.
- Chart.js and JSZip are optional CDN extras. If there is no internet, charts show a fallback message and Download All falls back to sequential downloads.
- WhatsApp sharing needs internet because it opens `wa.me`.
- Google Fonts fall back to normal local browser fonts when offline.

## 1. Start MongoDB

If MongoDB is already installed as a service, start it first.

Common macOS command:

```bash
brew services start mongodb-community
```

If MongoDB is already running, continue to the next step.

## 2. Create The Offline Environment File

```bash
cd "/Users/tikeshkumar/Documents/New project 2/jb-function-capture/backend"
cp .env.offline.example .env
```

The offline env uses:

```env
MONGODB_URI=mongodb://127.0.0.1:27017/jb-function-capture
STORAGE_PROVIDER=local
FRONTEND_URL=http://localhost:5000
```

For local testing only, the backend falls back to this admin login if `ADMIN_PASSWORD` is not set:

```text
Email: admin@jbeventpix.com
Password: Admin@12345
```

The backend also creates or updates this fixed admin account automatically every time the server starts.

## 3. Install Backend Dependencies

```bash
cd "/Users/tikeshkumar/Documents/New project 2/jb-function-capture/backend"
npm install
```

## 4. Optional: Create The Admin Account Manually

```bash
cd "/Users/tikeshkumar/Documents/New project 2/jb-function-capture/backend"
npm run create-admin
```

This uses the same fixed admin login unless you override `ADMIN_EMAIL` and `ADMIN_PASSWORD` in `backend/.env`.

## 5. Start The Website

```bash
cd "/Users/tikeshkumar/Documents/New project 2/jb-function-capture/backend"
npm start
```

Check the API:

```text
http://localhost:5000/api/health
```

Open:

```text
http://localhost:5000/
```

## 6. Test Admin Flow

1. Open `http://localhost:5000/pages/login.html`
2. Log in using the admin credentials from `backend/.env`
3. Open the admin dashboard
4. Create an event
5. Upload a cover image
6. Upload event photos

Uploaded files are stored locally in:

```text
backend/uploads
```

## 7. Test User Photo Search

1. Open `http://localhost:5000/pages/events.html`
2. Select an event
3. Use camera scan or upload a face photo
4. Submit the search
5. View matched results

## Troubleshooting

- If the server says MongoDB connection failed, MongoDB is not running or the `MONGODB_URI` is wrong.
- If uploads work but images do not appear, check that `STORAGE_PROVIDER=local` is set in `backend/.env`.
- If face detection is slow on first upload, wait for model loading. The models are bundled in `frontend/assets/models`.
- If the camera does not open, test with the Upload Photo tab first.
