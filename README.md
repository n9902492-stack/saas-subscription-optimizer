# SaaS Subscription Optimizer

A Next.js frontend and an Express API backed by MongoDB.

## Project structure

| Path | Responsibility |
| --- | --- |
| `frontend/src/app/layout.jsx` | Global Next.js layout and page metadata |
| `frontend/src/app/page.jsx` | Starter page and server-side API readiness check |
| `frontend/src/app/styles.css` | Global layout and visual styles |
| `backend/src/server.js` | Environment configuration, MongoDB startup and HTTP lifecycle |
| `backend/src/app.js` | Express app and readiness endpoint |
| `backend/src/config/database.js` | MongoDB client connection |
| `.env.example` in each app | Local configuration template |

As product features are added, use `frontend/src/features/<feature>/` for feature-specific UI and `backend/src/modules/<feature>/` for routes, controllers, services, validation and data access.

## Local setup on Windows PowerShell

Use Node.js 24 and a running MongoDB instance. From the repository root, open a terminal for the API.

```powershell
cd backend
Copy-Item .env.example .env
npm install
npm run dev
```

In a second terminal from the repository root, start Next.js.

```powershell
cd frontend
Copy-Item .env.example .env.local
npm install
npm run dev
```

Open http://localhost:3000. The status card reports whether the API can reach MongoDB. The readiness endpoint is http://127.0.0.1:4000/api/health. This commit establishes connectivity. Workspace creation, sign-in and permissions are the first product milestone.
