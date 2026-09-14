# Step 40 — Dashboard ops metrics + peak hours

## Added

- **Same weekday last week** comparison on Today's sales KPI hint
- **Void rate today** (voided ÷ completed+voided) → `/reports/voids`
- **Discount total today** (sum of line discounts) → `/reports/discounts`
- **Credit / debit notes this week** (count + total, last 7 days) → `/reports/credit-debit-notes`
- **Peak hours heatmap** (hours 06–23, last 7 days order counts; hidden until ≥15 completed orders)

## Placement

1. Sales KPIs (with weekday comparison)
2. Attention cards
3. Ops KPIs (void / discount / credit / debit)
4. Charts
5. Peak hours panel
6. Bestsellers / cashiers / rest

## Files

- `src/lib/dashboard/query-pos-dashboard.js`
- `src/app/[locale]/(app)/dashboard-client.jsx`
- `messages/en.json`, `messages/ar.json`
