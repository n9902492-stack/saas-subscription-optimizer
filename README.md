# SaaS Subscription Optimizer

A Next.js frontend and an Express API backed by MongoDB.

## Project structure

| Path | Responsibility |
| --- | --- |
| `frontend/src/app/layout.jsx` | Global Next.js layout and page metadata |
| `frontend/src/app/page.jsx` | Landing page and product concept video |
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

Open http://localhost:3000 for the landing page or http://localhost:3000/sign-in for account access. The readiness endpoint is http://127.0.0.1:4000/api/health. The starter supports email sign-up, sign-in, and workspace creation. The creator is assigned Admin in the same MongoDB document. The browser keeps the session in memory, so refreshing requires signing in again.

## Workspace milestone

| Path | Responsibility |
| --- | --- |
| `frontend/next.config.mjs` | Proxies same-origin API requests to Express |
| `frontend/src/features/workspaces/workspace-start.jsx` | Account and workspace setup UI |
| `backend/src/modules/auth/auth.js` | Password hashing, sign-in and session lifecycle |
| `backend/src/modules/workspaces/workspace.routes.js` | Workspace routes and request validation |
| `backend/src/modules/workspaces/workspace.repository.js` | Workspace persistence and membership-scoped reads |

## Landing and account pages

| Path | Responsibility |
| --- | --- |
| `frontend/src/app/page.jsx` | Landing page and silent product concept preview |
| `frontend/src/app/sign-in/page.jsx` | Sign-in entry point |
| `frontend/src/app/sign-up/page.jsx` | Sign-up entry point |
| `frontend/src/features/workspaces/account-page.jsx` | Account layout and animated team workflow |
| `frontend/public/workflow-preview.mp4` | Product concept video using illustrative data |

## Workspace dashboard and payment sources

After signing in, create or select a workspace to open its dashboard. Admin and Finance members can register corporate cards with a nickname and optional last four digits. Use a different nickname for each card in a workspace. The dashboard is part of the current account screen and uses its in-memory session.

| Path | Responsibility |
| --- | --- |
| `frontend/src/features/workspaces/workspace-dashboard.jsx` | Selected workspace and payment-source list and form |
| `frontend/src/features/workspaces/api-client.js` | Same-origin JSON requests for account and workspace features |
| `backend/src/modules/payment-sources/payment-source.routes.js` | Workspace membership checks, validation and payment-source persistence |

Use the registered payment source when importing a CSV statement.

## Statement import

Admin and Finance can upload a UTF-8 CSV (128 KiB or 1,000 transactions maximum), map four columns, preview samples and validation errors, and confirm the batch. Dates use YYYY-MM-DD, amounts use signed decimals, and currencies use a three-letter code. Amounts are stored as MongoDB Decimal128. Invalid batches cannot be saved. The database prevents duplicate normalized batches for the same workspace and card. Overlapping statements with partially shared transactions require future transaction-level reconciliation. The backend stores normalized rows and discards the input CSV.

| Path | Responsibility |
| --- | --- |
| `frontend/src/features/imports/statement-import.jsx` | File selection, mapping, preview and confirmation |
| `backend/src/modules/imports/statement-import.routes.js` | Scoped API and atomic batch persistence |
| `backend/src/modules/imports/statement-import.service.js` | CSV parsing, validation, normalization and duplicate fingerprint |
| `backend/src/modules/workspaces/finance-access.js` | Shared Admin and Finance authorization for workspace data |

## Saved transactions and merchant matching

Admin and Finance can review saved transactions in date order and match a statement merchant to a vendor name. The workspace stores one match per normalized merchant description. Editing a match updates the vendor displayed across that workspace while preserving original statement data. For example, matching both GITHUB and GITHUB.COM to GitHub requires one match for each description. Vendor names in this milestone are labels. The vendor inventory groups matching labels for spend reporting.

| Path | Responsibility |
| --- | --- |
| `backend/src/modules/transactions/transaction.routes.js` | Scoped transaction list and merchant matching |
| `frontend/src/features/transactions/transaction-list.jsx` | Transaction table, pagination and match form |

## Vendor inventory

Admin and Finance see all saved net spend, unmatched net spend, and per-vendor spend by original currency. Negative amounts reduce net spend. Vendor names with equivalent casing and whitespace group together. The inventory refreshes after CSV imports and merchant remapping.

| Path | Responsibility |
| --- | --- |
| `backend/src/modules/vendors/vendor.routes.js` | Workspace-scoped vendor grouping and exact native-currency totals |
| `frontend/src/features/vendors/vendor-inventory.jsx` | Vendor inventory and total and unmatched spend views |
| `backend/src/modules/transactions/merchant-key.js` | Shared normalization for merchant matching and reporting |

## Subscriptions and contract terms

Admin and Finance can create or edit subscription records for a matched vendor or a manually entered vendor name. A workspace member must own each record. Billing cycle, auto-renew status, contract end and notice deadline are separate fields. A notice deadline requires evidence and explicit confirmation. The app stores who verified it and when. Editing a verified record requires reconfirming the notice if a deadline remains on the form.

| Path | Responsibility |
| --- | --- |
| `backend/src/modules/subscriptions/subscription.routes.js` | Workspace-scoped records, membership checks and notice validation |
| `frontend/src/features/subscriptions/subscriptions.jsx` | Subscription list and contract form |

## Renewal calendar

Admin and Finance can browse the month-by-month calendar and review the next 30 calendar days, including today. Both views use verified notice deadlines. The upcoming window uses UTC and keeps contract end as a separate field. Counts show past verified deadlines and subscriptions that still need verification. Subscription edits refresh the calendar.

| Path | Responsibility |
| --- | --- |
| `backend/src/modules/renewals/renewal.routes.js` | Workspace-scoped calendar data, upcoming window, counts and owner labels |
| `frontend/src/features/renewals/renewal-calendar.jsx` | Month navigation and upcoming notice deadlines |

### Renewal reminders

The workspace dashboard derives in-app reminders from current verified notice deadlines, at 30 and 7 calendar days before notice is due. The list uses UTC, shows targets up to 30 days ahead, and retains elapsed milestones while their notice window is still open. Editing or clearing a deadline updates the list on the next refresh. This milestone does not send emails or run a background delivery worker.

### Renewal decisions

For a verified notice deadline, the assigned owner can record Keep, Reduce seats, Review overlap, or Cancel with a reason. Reduce seats also requires a proposed seat count. Admin and Finance can review all decisions in their workspace. Other members only see renewals assigned to them. Changing the notice date clears the prior current decision. Cancel records a decision for follow-up with the vendor.

### Vendor execution status

Admin and Finance can record vendor follow-up as Submitted, Confirmed, or Reopened. Each update requires a vendor reference or reason and stores the actor and timestamp. Owners can see the current status for their renewals. A revised decision starts again at Pending. The workflow records actions handled with the vendor outside the app.

### Renewal audit history

Admin and Finance can open View history for a verified renewal. Each successful decision or execution update records its actor, timestamp, notice deadline, and entered reason or reference. Execution entries include the previous status. The current update and its history entry are saved together. The most recent 100 updates per subscription are retained across notice deadline edits. Earlier updates are not backfilled.

### CSV license seat review

In Subscriptions and contracts, choose Review seats. Admin and Finance can replace the latest per-subscription seat snapshot with a UTF-8 CSV of 1–1,000 assigned seats. Use account and last_activity headers, one account per row, and YYYY-MM-DD dates. Blank activity remains Unknown. Reported activity 60 or more days before the snapshot date marks a candidate for review. Enter purchased seats to see unassigned seats or a purchasing discrepancy. The system stores normalized rows and import metadata. Live provider sync is separate.

### Read-only GitHub Copilot seat sync

Set COPILOT_WORKSPACE_ID (the MongoDB workspace ID), COPILOT_ORG (the GitHub organization slug), and COPILOT_READ_TOKEN in backend/.env, then restart Express. Use an authorized fine-grained token with GitHub Copilot Business organization Read permission. Keep the token server-side. In the configured workspace, Admin and Finance can open Review seats on the relevant Copilot subscription and select Sync GitHub Copilot seats. The action replaces the latest snapshot only after every page succeeds and the seat count reconciles. It preserves any manually entered purchased-seat count. Missing activity remains Unknown. CSV upload stays available. The connector uses GitHub's public-preview seat endpoint and does not modify GitHub licenses.

GitHub documentation: https://docs.github.com/en/rest/copilot/copilot-user-management#list-all-copilot-seat-assignments-for-an-organization
