# Step 49 — Standalone POS + cashier return/tour

## POS

- Standalone `/pos` (no admin sidebar / search)
- Header left: login name + return button
- Header center: restaurant logo, or restaurant name if no logo
- Cashier return → `/invoices` (“View invoices”)
- Everyone else return → `/` (“Go to dashboard”)
- Sidebar label: **Open POS**

## Cashier

- **No Dashboard** permission
- Login still `/pos`
- Tour starts on invoices (not POS); no first-login tour offer
- Other roles: tour still starts on dashboard
