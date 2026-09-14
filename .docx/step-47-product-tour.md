# Step 47 — Product tour (Hisabi parity)

## Behavior

- First-login offer modal (`HisabiStatusModal`) when `User.productTourSeenAt` is null and ≥2 CASL-filtered steps
- Start / Skip both call `POST /api/auth/account/product-tour/seen`
- Joyride walkthrough (`react-joyride@3.2.0`) with Back / Next / Skip + progress
- Expand sidebar groups / navigate Settings tabs before each spotlight
- On finish or skip: collapse all sidebar groups; finish shows success modal
- Replay from **Settings → Profile → View tutorial**
- Role-aware via `filterProductTourStepDefs` + `canAccessSidebarHref`
- Settings: **one sidebar step** (not per-tab); Profile page still has replay CTA
- `PRODUCT_TOUR_MIN_STEPS = 2` (Cashier still has POS + menu + invoices + settings)
- Tour start uses `getTourStartHref` (dashboard / invoices — never `/pos`, standalone POS remounts the shell)
- Cashiers never get the first-login offer; Profile **View tutorial** still works
- Cashier predefined role includes Dashboard read; login still lands on `/pos`

## Steps

Dashboard, restaurants (list/create/switcher), POS, menu (list/add/categories), invoices (list/CN/DN), HR (all children), reports group, settings (sidebar).

## Files

- Prisma `productTourSeenAt` + migration (backfills existing users)
- `src/lib/product-tour/*`, `src/components/product-tour/product-tour-provider.jsx`
- API `account/product-tour/seen`
- `admin-app-shell` / settings tabs / restaurant switcher `data-tour`
- Profile CTA + `ProductTour` / Settings i18n (en/ar)
