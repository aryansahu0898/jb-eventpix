# cPanel Deployment Guide

This guide explains how to make J.B. EventPix live on cPanel.

## Before You Start

Your hosting must support Node.js applications. In cPanel, look for one of these:

- `Setup Node.js App`
- `Application Manager`
- `Terminal` or `SSH Access`

If your cPanel only supports PHP/static hosting, this app cannot run fully on that plan because the backend is Node.js.

## What You Need

- cPanel login
- domain or subdomain connected to the hosting account
- MongoDB Atlas connection string
- Cloudinary account credentials
- Node.js 18, 20, or 22 in cPanel
- SSH or cPanel Terminal access

Node.js 22 is recommended. Avoid Node.js 25 for this app.

## Step 1: Prepare The Project

On your computer, make a zip of the project folder.

Recommended folder to upload:

```text
jb-function-capture
```

Do not upload only `backend` or only `frontend`; the backend serves the frontend using this sibling folder layout:

```text
jb-function-capture/
├── backend/
└── frontend/
```

## Step 2: Upload To cPanel

1. Open cPanel.
2. Go to `File Manager`.
3. Upload the zip outside `public_html` if possible.
4. Extract it into your home folder.

Recommended final path:

```text
/home/YOUR_CPANEL_USER/jb-function-capture
```

Keeping it outside `public_html` is cleaner because Node/Passenger will serve the app.

## Step 3: Create MongoDB Atlas

1. Create a MongoDB Atlas cluster.
2. Create a database user.
3. Open `Network Access`.
4. Add your cPanel server IP.

If you do not know the cPanel server IP, ask your hosting provider. For quick testing, Atlas can allow `0.0.0.0/0`, but use a strong database password.

Copy your connection string.

Example:

```env
mongodb+srv://USERNAME:PASSWORD@cluster0.xxxxx.mongodb.net/jb-function-capture?retryWrites=true&w=majority
```

## Step 4: Create Cloudinary Credentials

From your Cloudinary dashboard, copy:

```env
CLOUDINARY_CLOUD_NAME
CLOUDINARY_API_KEY
CLOUDINARY_API_SECRET
```

## Step 5: Create The Node.js App In cPanel

Open `Setup Node.js App` or `Application Manager`.

Use these values:

```text
Node.js version: 22 if available, otherwise 20 or 18
Application mode: Production
Application root: jb-function-capture/backend
Application URL: your domain or subdomain
Application startup file: server.js
```

If cPanel asks for an application path and URL path separately, keep the URL path as `/` if this app should be the whole website.

## Step 6: Add Environment Variables

In the Node.js app screen, add these environment variables:

```env
MONGODB_URI=mongodb+srv://USERNAME:PASSWORD@YOUR_CLUSTER/jb-function-capture?retryWrites=true&w=majority
JWT_ACCESS_SECRET=replace_with_a_long_random_secret
JWT_REFRESH_SECRET=replace_with_another_long_random_secret
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
NODE_ENV=production
FRONTEND_URL=https://yourdomain.com
FACE_MODEL_REMOTE_URL=https://justadudewhohacks.github.io/face-api.js/models
```

Use your real domain for `FRONTEND_URL`.

Do not add `PORT` unless your cPanel specifically asks for it. Passenger usually manages the port.

## Step 7: Install Dependencies

Open cPanel `Terminal` or connect by SSH.

Run:

```bash
cd ~/jb-function-capture/backend
npm install
```

If your cPanel provides a special Node activation command, run that first from the `Setup Node.js App` screen.

Some cPanel hosts show a command like:

```bash
source /home/YOUR_CPANEL_USER/nodevenv/jb-function-capture/backend/22/bin/activate
```

Use the command shown in your cPanel account if it appears.

## Step 8: Restart The Node App

In `Setup Node.js App`, click:

```text
Restart
```

If you are using Passenger manually, create the restart file:

```bash
mkdir -p ~/jb-function-capture/backend/tmp
touch ~/jb-function-capture/backend/tmp/restart.txt
```

## Step 9: Test The Health URL

Open:

```text
https://yourdomain.com/api/health
```

Expected response:

```json
{
  "status": "ok"
}
```

The response may also include a timestamp.

## Step 10: Open The Website

Open:

```text
https://yourdomain.com/
```

Then check:

```text
https://yourdomain.com/pages/register.html
https://yourdomain.com/pages/login.html
https://yourdomain.com/pages/events.html
```

## Step 11: Create The First Admin

1. Register a user from `/pages/register.html`.
2. Open MongoDB Atlas.
3. Go to `Browse Collections`.
4. Open the `users` collection.
5. Find the new user.
6. Change:

```json
"role": "user"
```

to:

```json
"role": "admin"
```

## Step 12: Use The Admin Dashboard

Open:

```text
https://yourdomain.com/pages/admin/dashboard.html
```

Then:

1. Create an event.
2. Upload a cover image.
3. Upload event photos.
4. Wait for face detection to complete.

## Step 13: Test The User Flow

Open:

```text
https://yourdomain.com/pages/events.html
```

Then:

1. Select an event.
2. Use camera or upload a face photo.
3. Search.
4. View results.
5. Download or share photos.

## Common cPanel Problems

### `Setup Node.js App` is missing

Your hosting plan does not support Node.js apps. Ask your host to enable Node.js/Passenger, or host the backend on a Node platform and keep only static files on cPanel.

### `npm install` fails on `canvas`

This means your cPanel server is missing native build dependencies or compatible binaries.

Ask your hosting provider if they support installing native Node packages. If they do not, this app needs VPS/Render/Railway hosting for the backend.

### `/api/health` shows 404

The Node app is not serving the domain. Check:

- application root is `jb-function-capture/backend`
- startup file is `server.js`
- URL path is `/`
- app was restarted

### Login works but admin dashboard fails

Your account is still `role: user`. Promote it in MongoDB Atlas.

### Image upload fails

Check:

- Cloudinary env variables
- MongoDB connection
- cPanel upload size limits
- application logs

### Camera does not open

Camera access requires HTTPS. Make sure SSL is active on your domain.

## Best Setup Recommendation

For a cPanel-only deployment, use:

```text
domain.com -> cPanel Node.js app -> backend/server.js -> frontend + API
```

This is better than putting the frontend in `public_html`, because the frontend and API stay on the same domain.
