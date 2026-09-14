# Step 45 — Unsaved changes leave guard (Restaurant settings)

## Goal

When Restaurant settings have unsaved edits (identity + contact/printer/numbering/financial/formats), leaving the page prompts a modal instead of silently discarding work.

## Behavior

1. **Dirty detection** — identity section (`onDirtyChange` / `isDirty`) plus settings form vs last loaded `BusinessSettings`.
2. **Intercept** — in-app link clicks (sidebar, settings tabs), browser Back, and tab close/refresh (`beforeunload`).
3. **Leave modal** (`HisabiStatusModal`, warning):
   - Title/description: unsaved changes; save or discard will lose them
   - **Save** — same unified save as the page footer (identity first, then settings)
   - **Don't save** — discard all edits, then navigate
4. **Save + tax re-onboard** — if CR/VAT digits changed, existing tax confirm modal runs next. **Confirm** saves then navigates. **Cancel** discards *all* unsaved changes and navigates (leave-flow only). Bilingual confirm cancel stays on the page.
5. **ZATCA redirect** — if save requires re-onboarding, identity navigates to `/zatca-onboarding` and the pending leave target is dropped.

## Files

- `src/hooks/use-unsaved-changes-guard.js`
- `src/app/[locale]/(app)/settings/restaurant/settings-restaurant-page-client.jsx`
- `src/components/settings/settings-restaurant-identity-section.jsx` (`discardChanges`, `tax_cancelled`, `redirected`, `onDirtyChange`)
- `messages/en.json`, `messages/ar.json`
