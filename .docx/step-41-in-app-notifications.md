# Step 41 — In-app notifications module

## Scope

In-app only (no new emails). Role-based fan-out + per-user preference toggles (for Settings Profile later).

## Events

| Type | Audience | Trigger |
|------|----------|---------|
| `zatca_report_failed` | Owner + Admin/Manager/Accountant | Checkout / send / note report fail |
| `zatca_report_pending` | same | Reminder: pending/failed ≥ 23h (1h left in 24h window) |
| `visa_expiring` / `visa_expired` | Owner + Admin/Manager/HR | Reminder job |
| `salary_slip_generated` | HR audience | Salary slip create |
| `advance_paid` | HR | Advance payment create |
| `advance_outstanding` | HR | Daily digest via reminders |
| `salary_cap_reached` / `exceeded` | HR | Employee payment create |
| `invoice_voided` | Sales ops | Cancel/void success |
| `credit_note_created` / `debit_note_created` | Sales ops | Note create |
| `role_changed` | Team audience + target user | Employee role PATCH |
| `member_joined` | Team + new user | Invitation accept |

## Architecture

- `Notification` is **per-user** (`userId` + `businessProfileId`)
- Prefs on `User`: `notifyZatca`, `notifyHr`, `notifySalesOps`, `notifyTeam`
- Bell polls `GET /api/auth/notifications` every 5s; opportunistic reminders (15m throttle)
- Toast listener on notifications toaster id

## Key files

- `prisma/schema.prisma` + migration `20260913210000_per_user_notifications`
- `src/lib/notifications/*`
- `src/app/api/auth/notifications/route.js`
- `src/components/app-shell/notifications-bell.jsx`
- `src/components/app-shell/notification-toast-listener.jsx`
- Emit sites: checkout, notes, invoice/note send, salary slips, payments, employees PATCH, invitations accept

## Not in this step

- Settings Profile UI for toggles (prefs exist on User; defaults true)
- Dedicated cron worker (reminders run on bell poll)
- New email alerts
