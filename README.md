# CAC Agbara Aanu Sioni Radio — Multi-Branch Rebuild

This rebuild keeps the same Firestore collections:

`users`, `branches`, `broadcasts`, `programmes`, `announcements`, `prayerRequests`, `comments`, `messages`, `subscribers`, `notifications`, `settings`, `auditLogs`.

## Included

- Public homepage
- Light/dark mode on homepage
- Light/dark mode in admin dashboard
- HQ Admin login
- Branch Admin login
- Branch-scoped programmes, announcements, prayer requests and broadcasts
- Live Radio Control from phone or computer microphone
- HQ branch relay control
- Branches, users, settings, messages, comments and subscribers
- FastAPI + FFmpeg live audio backend starter
- Firestore security rules
- BG Digital Ventures footer credit

## Existing Firestore

You do NOT need a new Firebase project.

Keep your current project and Firestore data.

For every Branch Admin user document, add:

```text
role: "branch_admin"
branchId: "THE_BRANCH_DOCUMENT_ID"
branchName: "Branch Name"
status: "active"
```

For HQ:

```text
role: "hq_admin"
status: "active"
```

## Setup

1. Put your existing Firebase Web configuration into:
   `assets/js/config/firebase-config.js`

2. Deploy `firestore.rules`.

3. Start the frontend using Live Server or deploy it.

4. For dashboard live broadcasting, configure the backend:
   - Install Python 3.11+
   - Install FFmpeg
   - Copy `backend/.env.example` to `backend/.env`
   - Add Icecast-compatible streaming server credentials
   - Run:
     `pip install -r backend/requirements.txt`
     `uvicorn backend.main:app --host 0.0.0.0 --port 8000`

5. If your backend is hosted somewhere else, run this once in the browser console:
   `localStorage.setItem("cac_api_base","https://api.yourdomain.com")`

6. In HQ Dashboard → Settings, save the public stream URL.

## Important technical note

The browser can capture microphone audio, but it cannot securely hold Icecast source passwords. That is why the live broadcast feature uses the FastAPI backend and FFmpeg.

For production, add Firebase ID-token verification to the backend live-control endpoints before allowing public use.
