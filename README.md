# J.B. EventPix

J.B. EventPix is a full-stack event photo system for schools and functions. Admins create events and upload albums, and users search for their photos using face matching.

## What Is Included

- Express + MongoDB backend in [backend](/Users/tikeshkumar/Documents/New project 2/jb-function-capture/backend)
- Static frontend in [frontend](/Users/tikeshkumar/Documents/New project 2/jb-function-capture/frontend)
- Bundled face model files in [frontend/assets/models](/Users/tikeshkumar/Documents/New project 2/jb-function-capture/frontend/assets/models)
- Offline localhost test guide in [OFFLINE_TEST.md](/Users/tikeshkumar/Documents/New project 2/jb-function-capture/OFFLINE_TEST.md)
- Render deployment blueprint in [render.yaml](/Users/tikeshkumar/Documents/New project 2/jb-function-capture/render.yaml)
- cPanel deployment guide in [CPANEL_DEPLOY.md](/Users/tikeshkumar/Documents/New project 2/jb-function-capture/CPANEL_DEPLOY.md)

## Runtime Requirements

- Node.js `22.x` recommended
- Works with Node `>=18 <25`
- MongoDB Atlas and Cloudinary for online production
- Local MongoDB only for offline testing

## Local Run

For full offline testing without Cloudinary, follow [OFFLINE_TEST.md](/Users/tikeshkumar/Documents/New project 2/jb-function-capture/OFFLINE_TEST.md).

1. Create your environment file.

```bash
cd backend
cp .env.example .env
```

2. Fill in real values in `backend/.env`.

3. Install dependencies.

```bash
cd backend
npm install
```

4. Start the app.

```bash
cd backend
npm start
```

5. Open the site.

```text
http://localhost:5000/
```

## Deploy Online With Render

### 1. Push This Project To GitHub

If this folder is not already on GitHub:

```bash
cd "/Users/tikeshkumar/Documents/New project 2/jb-function-capture"
git init
git add .
git commit -m "Initial deploy"
git branch -M main
git remote add origin YOUR_GITHUB_REPO_URL
git push -u origin main
```

Do not commit `backend/.env`.

### 2. Create MongoDB Atlas

Create:

- one Atlas project
- one cluster
- one database user

Then copy your MongoDB connection string.

For the first deploy, allow network access from `0.0.0.0/0` so Render can connect.

### 3. Create Cloudinary Credentials

From Cloudinary, collect:

- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`

### 4. Create A Render Web Service

In Render:

1. Click `New +`
2. Choose `Blueprint` if you want to use `render.yaml`, or `Web Service` if you want to configure manually
3. Connect your GitHub repo

If using the blueprint, Render will read [render.yaml](/Users/tikeshkumar/Documents/New project 2/jb-function-capture/render.yaml).

### 5. Set The Environment Variables

In Render, set these values:

```env
MONGODB_URI=mongodb+srv://USERNAME:PASSWORD@YOUR_CLUSTER/jb-function-capture?retryWrites=true&w=majority
JWT_ACCESS_SECRET=replace-with-a-long-random-secret
JWT_REFRESH_SECRET=replace-with-another-long-random-secret
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
FRONTEND_URL=https://your-service-name.onrender.com
NODE_ENV=production
FACE_MODEL_REMOTE_URL=https://justadudewhohacks.github.io/face-api.js/models
```

Render will provide the `PORT` automatically.

### 6. Wait For First Deploy

When deployment finishes, open:

```text
https://your-service-name.onrender.com/api/health
```

Expected result:

```json
{
  "status": "ok"
}
```

### 7. Open The Website

Use:

```text
https://your-service-name.onrender.com/
```

### 8. Log In As Admin

Set the private admin values in your host environment first:

```env
ADMIN_EMAIL=your_private_admin_email
ADMIN_PASSWORD=your_private_admin_password
```

Open:

```text
https://your-service-name.onrender.com/pages/login.html
```

Enter the private admin email and password from your host environment. The backend creates or updates this admin account automatically when the server starts.

Then the app redirects to:

```text
https://your-service-name.onrender.com/pages/admin/dashboard.html
```

### 9. Create An Event And Upload Photos

From the admin dashboard:

- create an event
- upload a cover image
- upload event photos

The backend will:

- send images to Cloudinary
- detect faces
- store descriptors in MongoDB

### 10. Test The Public Search Flow

1. Open `/pages/events.html`
2. Select an event
3. Use camera or photo upload
4. Search
5. Open results
6. Download or share matched photos

## Manual Render Settings

If you prefer configuring Render without the blueprint:

- Runtime: `Node`
- Build Command: `cd backend && npm install`
- Start Command: `cd backend && npm start`
- Health Check Path: `/api/health`
- Node Version: `20.18.0`

For user email verification, also configure SMTP:

- `PUBLIC_BASE_URL`
- `EMAIL_HOST`
- `EMAIL_PORT`
- `EMAIL_SECURE`
- `EMAIL_USER`
- `EMAIL_PASS`
- `EMAIL_FROM`

## Important Notes

- The frontend is served by the backend, so one Render web service is enough.
- The fixed admin is created automatically at startup.
- User registration requires email verification before login.
- `backend/node_modules` should not be committed to GitHub.
- Node `25.x` is not recommended for this project because native dependency compatibility was unstable during packaging.

## Troubleshooting

### MongoDB connection fails

Check:

- Atlas IP access list
- MongoDB username and password
- database name in `MONGODB_URI`

### Images fail to upload

Check:

- Cloudinary keys
- Cloudinary account status
- request size limits in your host logs

### Face detection fails

Check:

- bundled files in `frontend/assets/models`
- `FACE_MODEL_REMOTE_URL`
- host logs for TensorFlow or `canvas` startup errors

### Admin pages return 403

Your account is still a normal user in MongoDB.

## File References

- App entry: [backend/server.js](/Users/tikeshkumar/Documents/New project 2/jb-function-capture/backend/server.js)
- Backend env example: [backend/.env.example](/Users/tikeshkumar/Documents/New project 2/jb-function-capture/backend/.env.example)
- Render blueprint: [render.yaml](/Users/tikeshkumar/Documents/New project 2/jb-function-capture/render.yaml)
