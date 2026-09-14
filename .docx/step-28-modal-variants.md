# Step 28 — Modal variants by situation (Hisabi parity)

## Mapping (HisabiStatusModal / Overlay accent)

| Situation | Variant | Visual |
|-----------|---------|--------|
| Delete / soft-delete | `error` | Red bar + destructive CTA |
| Cancel invoice / deactivate cashier / bilingual caution | `warning` | Gold bar + muted CTA |
| Success (note print preview, cashier created) | `success` | Teal bar |
| Forms / legal / help | `neutral` | Primary-container bar |

## Changes

- Soft-delete confirm: `warning` → **`error`** (was same gold as cancel)
- Cashier add: `HisabiOverlayModal` neutral → success after create
- Cashier deactivate: StatusModal **warning** confirm
- Legal modal + category edit: neutral accent bar
- Bilingual confirm: warning accent bar
- Documented variant map on StatusModal / OverlayModal
