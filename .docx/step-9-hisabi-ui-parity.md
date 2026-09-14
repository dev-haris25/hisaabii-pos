# UI parity — Hisabi shell, lists, forms, sheets

## Summary

Aligned hisabi-pos admin UI with Hisabi’s products/portal patterns: same sidebar/header layout, list table tokens, toolbar/filter chrome, pagination footer, form field/focus/gold CTA styling, and category manage dialog shell.

## Shared modules copied/mirrored from Hisabi

- `src/lib/list-views/list-table-styles.js`
- `src/lib/list-views/list-page-toolbar-styles.js`
- `src/lib/list-views/build-pagination-items.js`
- `src/components/list-views/list-table-toolbar.jsx`
- `src/components/list-views/list-table-pagination.jsx`
- `src/lib/settings/format-helpers.js` (`formatLocalizedNumber`)
- `src/components/hisabi-status-modal.jsx`
- `ActionIconButton` base classes → `text-slate-400` (Hisabi)

## Updated surfaces

| Surface | Change |
|---------|--------|
| `AdminAppShell` | Portal header spacers; sidebar footer = gold logout only |
| Menu list | Products layout: `max-w-hisabi-container`, segmented status, gold-muted Add, white table card, `ListTableToolbar`, sticky name col, green/slate badges, products pagination footer |
| Category modal | ProductManageDialogShell (z-130, primary blur, overlay-md, X header, gold AuthSubmitButton) |
| Menu item form | Products page chrome: back circle, `type-headline-xl`, primary focus fields, status segmented control, cancel + gold Save |
| Dashboard placeholder | Same container/card tokens as lists |

## i18n

Added Menu keys for list toolbar/pagination and form cancel/subtitles (`loadingList`, `showingCount`, `rowsPerPage*`, `range*`, `page*`, `cancel`, `backToMenu`, `itemNewSubtitle`, `itemEditSubtitle`).

## Notes

- Search stays server-side via URL (debounced); filters/pagination remain in query params.
- Teal CTAs / teal focus rings removed from these admin surfaces in favor of Hisabi primary/gold patterns.
