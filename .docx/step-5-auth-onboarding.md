# Step 5 — Auth + restaurant onboarding

## Summary

Ported Hisabi ADMIN auth (register → email OTP → login → restaurant BusinessProfile) into Hisabi POS with the same AuthSplitShell UX/styling. **Client portal login is removed.** Dev auto-verify login matches Hisabi (`HISABI_DEV_AUTOVERIFY_LOGIN=true` + `NODE_ENV=development`).

## Flow

1. `POST /api/auth/register` — creates draft `BusinessProfile` + ADMIN `Staff` (`emailVerified: false`), sends OTP email.
2. OTP verify (`/register/verify`) — always required. With
   `HISABI_DEV_AUTOVERIFY_LOGIN=true` (dev), `000000` is accepted; real emailed
   codes still work. Forgot-password OTP uses `HISABI_DEV_AUTOVERIFY_OTP` the
   same way. Login never skips email verification.
3. Session cookie `hisabi_pos_session`.
4. Incomplete profile → `/business-profile` (POST `/api/auth/business-profiles` updates draft, sets `onboardingCompletedAt`).
5. Home `/` requires session; redirects incomplete users to onboarding.

## Intentionally different from Hisabi

| Area | Decision |
|------|----------|
| Client login / portal | Removed (no Business/Client tabs) |
| Multi-company | Single restaurant per account |
| Custom VAT / stamp / signature | Not in POS schema; custom VAT UI stripped from onboarding |
| ZATCA gate | `needsZatcaOnboarding` forced `false` until Step 6 |
| Branding | OTP email + meta titles say Hisabi POS |

## Key files

- `src/lib/auth/*` — session, OTP, schemas, landing path, password rules
- `src/app/api/auth/*` — register, OTP, login (dev autoverify), logout, me, forgot/reset, business-profile(s), translate
- `src/app/[locale]/{login,register,forgot-password,business-profile}/*`
- `src/components/auth/*`, `AuthSessionSync` in `app-providers.jsx`
- `messages/en.json`, `messages/ar.json` — Login, Register, BusinessProfile, AuthErrors, legal, bilingual helpers
- `.env.example` — `HISABI_DEV_AUTOVERIFY_LOGIN`, optional `TRANSLATION_API_KEY` / `GEMINI_TRANSLATION_MODEL`

## Env

Copy translation keys from Hisabi `.env.dev` into POS `.env` if bilingual EN→AR suggestions should work locally. Leave empty to skip Gemini calls.

## Not in this step

- Cashier PIN login UI
- ZATCA onboarding screens (Step 6)
- App shell / POS modules
