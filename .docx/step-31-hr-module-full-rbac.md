# Step 31 — HR Module + Full RBAC

## Summary

Replaced the two-role (`ADMIN` / `CASHIER`) login-code system with predefined-role CASL RBAC and a full HR module ported from Hisabi, adapted for hisabi-pos (no finance/banking module, no custom roles, no EmployeePromotions).

## Architecture

- **User** — login identity only
- **BusinessMembership** — restaurant tenancy
- **EmployeeRole** — multi-role permissions per membership (union)
- **Employee** — restaurant-scoped HR record; optional `businessMembershipId` for login-capable staff
- Kitchen/Staff or zero roles → HR-only employee (no User/membership)
- Cashier invoice mutations → server-side rolling 24h window

## What shipped

### Schema / migration

- Dropped `StaffRole`, `User.role`, login-code fields, membership role column
- Added `Role`, `RolePermission`, `EmployeeRole`, `UserInvitation`
- Added HR models: Department, Designation, IdType, PayslipCategory, Employee, SalarySlip(+Line/Counter), EmployeePayment
- Migration: `prisma/migrations/20260913140000_hr_rbac_predefined_roles`

### RBAC

- `src/lib/rbac/*` — permission registry, predefined role seed, ability builder, API authorize, sidebar filters, cashier 24h helper
- Frontend `AbilityProvider` wired into `admin-app-shell.jsx`
- Ability-driven nav (including HR group + visa expiry badge)

### Auth unify

- Removed cashier login-code APIs/UI and static cashier shell
- Unified email+password login; guards/session JSON use abilities + role names

### Invite flow

- Create employee with login roles → `UserInvitation` + SMTP email
- Accept page: new user (set password) vs existing user (sign in then accept)
- Links accepted membership back to `Employee.businessMembershipId`
- Edit-employee upgrade: assign login roles to a no-login employee → invite

### HR UI

- Employees (list/add/edit/detail + documents + Access & Roles)
- Departments, Designations, Payslip Categories (lookup list pattern)
- Salary Slips, Employee Payments (no bank/expense sync)
- Visa Status filtered list + sidebar count badge

### Rules

- `rules.md` Rules 14 & 15 rewritten for predefined-role RBAC and unified login

### Stubs / limitations

- ~~Salary slip PDF/email~~ — implemented (print page + Puppeteer PDF + SMTP)
- No promotions UI/API
- No bank/cash/expense/cheque finance sync on payments
- Nationality is a text field (no world-countries)
## Out of scope (explicit)

- EmployeePromotions
- Custom role editor
- Finance/cheque/expense linkage from Hisabi payroll

