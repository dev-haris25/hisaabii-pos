# Step 6 — ZATCA onboarding

## Summary

Ported Hisabi’s ZATCA onboarding UX (OTP screen, skip, Fatoora help modal) into Hisabi POS. Server pipeline reuses existing `onboardZatca` (CSR → compliance CSID → 6 checks → production CSID). Post-auth gate `needsZatcaOnboarding` is enabled again.

## Flow (same as Hisabi)

1. After restaurant profile is complete → `/zatca-onboarding`
2. Enter 6-digit Fatoora OTP → `POST /api/auth/zatca-onboarding/compliance-csid`
3. Success screen → go to home
4. Or **Skip for now** → `POST /api/auth/zatca-onboarding/skip` sets `BusinessProfile.zatcaOnboardingSkipped = true` → home (OTP step is never auto-skipped; skip is explicit)

## Key files

- `src/app/[locale]/zatca-onboarding/{page,loading,zatca-onboarding-view}.jsx`
- `src/app/api/auth/zatca-onboarding/compliance-csid/route.js`
- `src/app/api/auth/zatca-onboarding/skip/route.js`
- `src/components/zatca/{zatca-otp-help-link,fatoora-otp-help-modal}.jsx`
- `src/lib/support/zatca-support-whatsapp-link.js`
- `src/lib/auth/auth-user-json.js` — gate restored
- `messages/*` — `ZatcaOnboarding`, `ZatcaErrors`

## POS adaptations

- Single restaurant via `session.businessProfileId` (no multi-company / `businessProfileId` targeting)
- No subscription gate
- No User-level skip fallback
- Support WhatsApp copy says Hisabi POS

## Env

- `NEXT_PUBLIC_ZATCA_SUPPORT_WHATSAPP` (optional; hides contact link if empty)
- Existing `ZATCA_ENABLED` / `ZATCA_ENV`

## Not in this step

- App-shell ZATCA reminder modal (no shell yet)
- Cashier PIN
- Menu / POS checkout
