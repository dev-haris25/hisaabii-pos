# Hisabi POS — Project Rules

> **Cursor: read this file in full before starting any implementation.** These rules are non-negotiable and apply to every task, page, screen, and feature in this project unless explicitly overridden by the user for that specific task.

---

## 1. Language and Stack

- This project uses **JavaScript, not TypeScript** — no `.ts`/`.tsx` files anywhere in the codebase (config files that require `.ts`, e.g. `prisma.config.ts`, are the only exception), and no TypeScript type-checking step in the build/validation process.

---

## 2. Server/Client Component Structure

- All main pages must be **Server Components**.
- For every page that needs interactivity, create a **separate, dedicated Client Component** for that page.
- Do not make a whole page a Client Component just because part of it needs interactivity — isolate the interactive part into its own client component and keep the page itself server-rendered.

---

## 3. Search, Filters, and Pagination

- All search, filtering, and pagination logic must be **server-side** — do not filter/paginate large datasets (orders, invoices, menu items) on the client.
- The current filters, search query, and page number must always be reflected in the **URL query parameters**.
- Refreshing the page, sharing the URL, or using browser back/forward must preserve and restore the exact same filtered/paginated view.

---

## 4. Styling

- **Never write inline styles** for anything, anywhere in the codebase.
- Always use the **Hisabi design system** (tokens, utility classes, and components already defined in `src/styles/hisabi-design-system.css` and the shared component library) — this app is branded and styled identically to Hisabi.
- If a needed style/token doesn't exist yet in the design system, add it to the design system first — do not hardcode a one-off value inline or in a component-local style block.
- Use **`clamp()`** for every size value in the system — containers, buttons, sheets, sidebars, spacing, border radii, icon sizes, text, and headings. Tailwind breakpoint classes (`sm:`, `md:`, `lg:`) are reserved for **structural layout changes** (e.g. cart panel collapsing, grid column count, table-to-card layout switches), not for scaling individual values.
- Any new size token added to the design system must be expressed as a `clamp()` value, consistent with the existing token pattern.

---

## 5. Error Handling

- **Never show raw or technical API errors to the user** (no stack traces, no raw error codes, no backend exception messages, no raw ZATCA rejection XML/validation codes surfaced directly in the UI).
- Every error must be mapped to a **human-readable, non-technical message** before it reaches the UI.
- ZATCA-specific errors must go through a shared humanizer (mirroring Hisabi's `humanizeZatcaError` / `toastZatcaError` pattern) — never surface a raw ZATCA API response to a cashier or admin.
- This mapping should happen consistently through a shared error-mapping utility, not ad hoc per component.

---

## 6. Responsive Design

- The entire system must be **fully responsive**, including the POS checkout screen on tablets and smaller counter displays.
- Use `clamp()` for every size value (see Rule 4).
- Do not rely only on Tailwind breakpoint classes for sizing — reserve those for structural layout changes.

---

## 7. QA — Test Cases Are Mandatory, Not Optional

- Every implementation must be **QA-proof from the start** — all relevant test cases must be handled on both the **frontend and backend** as part of the initial implementation, not patched in afterward.
- For every module/feature task, a **detailed, feature-specific test-case list** will be provided in the prompt.
- The implementation is not considered complete until it **passes every listed test case** — this includes edge cases, empty states, error states, validation failures, and permission/role checks, not just the happy path.
- If a listed test case cannot be satisfied as described, flag it explicitly rather than silently skipping it.

---

## 8. Implementation Logging

- After **every implementation** (every feature, module, or meaningful change), create an implementation log file inside the `.docx` folder at the project root (create it if it doesn't exist).
- This log should document what was built, what files were touched, and any notable decisions made during implementation, so there's a running history of the project.
- The exact file naming and internal format is up to Cursor's discretion, but a log file must be created every time.

---

## 9. Temporary Scripts

- If Cursor creates any script for testing or debugging purposes that is only meant for one-time use during an implementation (e.g. a seed script, a manual data-check script, a temporary debug utility), it must be **deleted after the implementation is complete**.
- Do not leave one-time debugging/testing scripts in the codebase — the repository should only contain code that's part of the actual application, not leftover scratch scripts.

---

## 10. Form Fields

- Every required form field must show a visible `*` beside its label.
- Every text input, search input, textarea, and selector must provide clear placeholder text describing the expected value or action.
- Placeholder text does not replace a visible field label.

---

## 11. General Principle

If any instruction in a task prompt seems to conflict with these rules, flag the conflict instead of silently picking one side — these rules are the default behavior for this entire project.

---

## 12. Shared Loading and Nested-Page Navigation

- Use a single shared `AppLoader` / `LoadingState` component for every loading state, including page transitions, Suspense fallbacks, list/query loading, selectors, dialogs, and button actions. Build it once, early, and use it consistently — don't let one-off spinners spread across the app before the shared one exists.
- Do not add one-off spinners, raw icon-spin usages, or loading text without the shared loader.
- Every nested page (order detail, invoice detail, menu item edit, settings page) must render a shared `PageBackButton` above its page heading.
- Top-level dashboard/list pages and the main POS checkout screen do not receive a back button.

---

## 13. List-View Action Columns

- Every table **Actions** column (invoice list, menu item list, staff list, etc.) must use compact **icon buttons** with **tooltips** — never text buttons with filled/outline backgrounds.
- Use a shared `ActionIconButton` / `ActionIconLink` component wrapped in a `Tooltip` component (build these once, reuse everywhere).
- Icon buttons must set a clear `aria-label`; the tooltip label should match the action name (e.g. View, Edit, Delete, Report to ZATCA).
- Page-header / toolbar primary actions (e.g. "Add menu item", "Report to ZATCA" outside a table) may still use labeled `Button`s — this rule applies only to row **Actions** columns.

---

## 14. Multi-Restaurant (Hisabi-style)

- Identity is **`User`** (email + password login). Restaurant access is via **`BusinessMembership`** (userId + businessProfileId).
- **`User.activeBusinessProfileId`** is the active-restaurant pointer. Switching updates this field in the DB — not a cookie or URL param.
- Any login-capable employee may hold **multiple** `BusinessMembership` rows and use the sidebar restaurant switcher when they have more than one membership. Each restaurant has separate menu, employees, invoices, counters, and **`ZatcaDevice`** (1:1 per `BusinessProfile`).
- Roles are assigned **per membership** via **`EmployeeRole`** (many-to-many). Permissions for the active restaurant are the **union** of all roles on that membership.
- HR **`Employee`** records are scoped per restaurant (`businessProfileId`) and optionally linked to a `BusinessMembership` when the person has login access.
- Do not invent a parallel tenancy system; always resolve the active restaurant through membership + `activeBusinessProfileId` helpers.

---

## 15. Predefined Roles + RBAC (CASL)

- **Restaurant ownership** is identity, not a picker role: exactly one `BusinessProfile.ownerUserId`. The owner always gets synthetic CASL `{ manage, all }`. Ownership is fixed at restaurant creation — **no transfer**.
- The owner’s employee row is **never** shown in HR employee lists/detail (for anyone, including the owner).
- Roles are **predefined and seeded per restaurant** — no custom role editor in the UI. Seeded roles: **Admin**, **Manager**, **Accountant**, **HR**, **Cashier**, **Kitchen/Staff**.
- **Admin** has the same product access as the owner (`manage` / `all`) and is assigned like any other role. Anyone with HR employee create/update permission can assign Admin — no special Admin-only gate.
- Other roles get fixed `RolePermission` rows from the seed map in `src/lib/rbac/seed-predefined-roles.js`. `ensurePredefinedRolesExist` **always resyncs** those rows from the seed map so matrix changes apply to existing restaurants.
- **BusinessProfile** (restaurant settings) is owner/Admin-only in the seed matrix — Manager and Accountant do **not** get BusinessProfile read/write.
- Menu and Employee UIs must hide create/edit/delete (and related bulk controls) when the user lacks the matching CASL action; **view** remains available for read-only roles (e.g. Cashier/Accountant on Menu, Accountant on Employees).
- An employee may be assigned **multiple roles** on one membership; effective permissions are the union. Role assignment is **optional**.
- **No-login employees:** if no roles are selected, or only Kitchen/Staff (empty permission union), create an HR `Employee` only — **no** `User`, membership, or invitation. Assigning a real role later triggers the invitation flow.
- **Unified login:** all login-capable employees use **email + password** (same flow). There is no cashier login-code flow.
- **Cashier** sidebar is ability-driven and effectively limited to **POS + Invoices** (plus Menu read for POS). Cashiers may create/edit/void/delete invoices and notes from the **last rolling 24 hours** (restaurant-wide). The 24h cutoff is evaluated **server-side only**; API responses may include server-computed action flags for the UI.
- RBAC is enforced with **CASL** (`@casl/ability` / `@casl/react`) on **both frontend and backend** — hide unauthorized UI and reject unauthorized API calls via `authorizeBusinessRequest`.
- Enforce permission checks server-side on every protected API route, not just by hiding UI.

---

## 16. Shared Component Reuse

- Before building a new UI component (menu item card, receipt line item, status badge, etc.), check `src/components/shared/` (or the equivalent shared components folder) for an existing one to reuse or extend.
- Do not build parallel, near-duplicate components for the same visual pattern in different features.

---

## 17. ZATCA Compliance Logic Stays Server-Side, No Shortcuts

- All ZATCA logic — CSR generation, CSID/OTP handling, UBL XML generation, ECDSA signing, QR (TLV) generation, and API submission — lives only in `src/lib/zatca/*`, server-side. Never sign, generate XML, or call the ZATCA API from client-side JS.
- Never bypass the `ZATCA_ENV` (sandbox/simulation/production) distinction or mix compliance-CSID and production-CSID credentials.
- Never take a shortcut that skips a required UBL field, the QR's 9-tag order, or the compliance-check step of onboarding "just to get it working" — ZATCA rejects invoices, and near-misses are not acceptable in this domain.

---

## 18. Invoice Counter and Hash Chain Integrity

- The sequential invoice counter (`ZatcaDevice.invoiceCounter`) must **never** be skipped, reset, or reordered by any code path, including retries, manual re-reports, or error-handling branches.
- The hash chain (`lastInvoiceHash` / PIH) must always reference the correct previous invoice's hash. A manual "Report to ZATCA" retry must reuse the **same** invoice hash/UUID that was originally generated for that invoice — never regenerate a fresh hash for a retry of the same invoice.
- Any change touching invoice numbering, hashing, or the submission pipeline must be reviewed against this rule explicitly before merging.

---

## 19. No Invoice Is Ever Silently Dropped

- Every invoice must reach a visible, trackable state: `pending`, `reported`/`cleared`, or `failed` — never disappear from view if ZATCA submission fails.
- The **"Report to ZATCA" action must always be visible** on any invoice that isn't yet reported (`pending` or `failed`), not only after a failure — staff can force an immediate report at any time.
- ZATCA reporting happens at checkout only. If reporting fails, checkout fails and the invoice stays `failed` with a human-readable error — there is no background retry worker.

---

## 20. Receipts Must Always Carry the Full Phase-2 QR

- A receipt must never be printed or displayed before the invoice is fully signed with the real **9-tag Phase-2 QR** (seller name, VAT number, timestamp, total incl. VAT, VAT total, XML hash, cryptographic stamp, public key, ZATCA stamp).
- Never print a receipt with a partial/Phase-1 QR (fewer than 9 tags) or an unsigned invoice — checkout must complete signing before the print bridge is called.

---

## 21. Printing Goes Through the Print Bridge Only

- The browser/web app must **never** attempt direct printer access (no browser print dialog as a fallback, no client-side ESC/POS calls).
- All receipt printing goes through the local Node.js print-bridge service, which sends raw ESC/POS commands to the network thermal printer (LAN, TCP port 9100).
- The web app's job is to hand the print bridge fully-formed receipt data (already including the signed invoice's QR); the print bridge's job is only to render and send ESC/POS bytes — keep this boundary clean, don't let formatting/business logic leak into the print bridge or printer logic leak into the web app.

---

## 22. No Inventory/Stock Fields

- This product is deliberately **inventory-free**. Do not add stock-tracking fields (e.g. quantity on hand, low-stock thresholds, stock movements) to `MenuItem` or any related model, even incidentally while building another feature.
- If inventory tracking is ever wanted, it must be a deliberate, separately-scoped feature decision — not something that creeps in through a "quantity available" field or similar.

---

## 23. Money and VAT Precision

- Store all monetary amounts (prices, discounts, VAT, totals) as **strings**, not floats — mirroring Hisabi's convention — to avoid floating-point rounding errors in VAT/total calculations.
- All VAT/total math must go through shared calculation helpers (not ad hoc arithmetic scattered across components/routes) so rounding behavior stays consistent everywhere.

---

## 24. Single-Terminal ZATCA Device Assumption Is Explicit

- `ZatcaDevice` is **1:1 with the business**, not per-POS-terminal. All terminals/cashiers share the same onboarded CSID, invoice counter, and hash chain.
- If multi-terminal (multiple physical tills each needing their own ESU) support is ever added, it is a deliberate schema and architecture change — never assume it "just works" by adding a second terminal without addressing shared-counter concurrency first.

---

## 25. Always Create Prisma Migrations — Never Use `db push`

- Every schema change must go through **`prisma migrate dev --name <descriptive-name>`**, which creates a tracked `.sql` file under `prisma/migrations/` — never `prisma db push`.
- `db push` does not create migration history, which breaks reproducing the schema on other environments (staging, production, another developer's machine) and breaks tracking exactly what changed and why.
- If a migration step would drop or alter data in a way Prisma flags as dangerous, stop and get explicit user consent first (same policy as any other destructive database operation) — never bypass this by silently falling back to `db push` to avoid the prompt.
- Per-restaurant runtime configuration (e.g. printer IP/port) belongs on the relevant model (e.g. `BusinessProfile`) and is set through the app by the `ADMIN`, never hardcoded per-deployment in `.env` — `.env` values for such settings are dev-only fallbacks, never the real multi-tenant source of truth.

---

## 26. HR advance recovery (salary slips)

- Employee **Total earned** is the sum of salary-slip **net** totals (not auto-accrual from joining date/salary).
- **Outstanding advance** = advance payments − salary-slip deduction lines whose payslip category name is exactly **`Advance`** (case-insensitive).
- Each restaurant must have a system **Advance** deduction payslip category (seeded/ensured). It cannot be renamed or deleted; default amount may still be edited.
- Salary-slip UI should guide users to use the **Advance** deduction to settle outstanding advances (`advanceBanner`).
