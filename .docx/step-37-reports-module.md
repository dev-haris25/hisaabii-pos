# Step 37 — Reports module (Hisabi-style)

## Summary

Added a full **Reports** module to Hisabi POS, styled like Hisabi (`ReportPageShell`, date filters, stat cards, CSV export, list table classes). Sixteen POS-adapted reports with CASL permissions.

## Reports

1. Sales  
2. Menu Items  
3. Tax  
4. Daily  
5. Date Range Summary  
6. Comparison  
7. Cashiers  
8. Payments  
9. ZATCA Status  
10. Credit & Debit Notes  
11. Voids  
12. Discounts  
13. Categories  
14. Salary Slips  
15. Employee Payments  
16. Advances  

## RBAC

- **Owner / Admin** — full access (`manage` / `all`)  
- **Manager / Accountant** — all report subjects (read)  
- **HR** — Salary Slips, Employee Payments, Advances only  
- **Cashier / Kitchen** — none  

Roles are resynced via `ensurePredefinedRolesExist` on ability build.

## Key files

- `src/lib/reports/*` — money, parse params, CSV, auth helper, `queries/pos-reports.js`
- `src/components/reports/report-page-shell.jsx`, `report-shared.jsx`
- `src/app/[locale]/(app)/reports/reports-module-client.jsx` + 16 pages
- `src/app/api/auth/reports/*/route.js` — 16 GET APIs
- RBAC: `permission-registry.js`, `seed-predefined-roles.js`, `sidebar-permissions.js`, `api-route-permissions.js`
- Sidebar: `admin-app-shell.jsx` Reports group
- i18n: `messages/en.json`, `messages/ar.json` (`Reports` + AppShell labels)

## Notes

- No inventory / AR / GL reports (data not present in POS).
- Tax is output VAT only (plus credit/debit note adjustments).
- Advances report uses the system **Advance** payslip category rules.
