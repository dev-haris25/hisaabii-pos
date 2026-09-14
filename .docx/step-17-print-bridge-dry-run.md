# Step 17 — Print bridge + dry-run (plan Step 11)

## Summary
Local ESC/POS print bridge with dry-run (no physical printer), POS Print button gated on Phase-2 QR, and admin printer IP/port settings.

## Behavior
1. **Print bridge** (`bun run print-bridge`) listens on `127.0.0.1:3910`
   - `GET /health`
   - `POST /print` — builds ESC/POS via `node-thermal-printer`, requires Phase-2 QR
   - **Dry-run** (`PRINT_BRIDGE_DRY_RUN=true`): writes `.bin` under `tmp/print-dry-run/` instead of TCP 9100
   - Live mode: sends bytes to `printer.ip:printer.port` (default 9100)
2. **Next.js** `POST /api/auth/pos/print` loads the invoice, refuses without QR, calls the bridge with restaurant printer settings
3. **POS receipt overlay**: Print only when `qrCode` is present (rules.md #20 / #21)
4. **Settings** (`/settings`): ADMIN sets `printerIp` / `printerPort` on `BusinessProfile`

## Dry-run test
1. Ensure `.env` has `PRINT_BRIDGE_DRY_RUN=true` (and optional empty `PRINT_BRIDGE_SECRET`)
2. Restart Next if env changed: `bun run dev`
3. Start bridge: `bun run print-bridge`
4. Complete a POS sale that gets a ZATCA QR
5. Click **Print receipt** → toast “Dry-run print saved…”
6. Check `tmp/print-dry-run/receipt-*.bin` for ESC/POS bytes

## Env
- `PRINT_BRIDGE_URL`, `PRINT_BRIDGE_PORT`, `PRINT_BRIDGE_SECRET`
- `PRINT_BRIDGE_DRY_RUN`, optional `PRINT_BRIDGE_DRY_RUN_DIR`

## Key files
- `scripts/print-bridge-server.mjs`
- `src/lib/print/build-receipt-from-invoice.js`
- `src/lib/print/send-receipt-to-print-bridge.js`
- `src/app/api/auth/pos/print/route.js`
- `src/app/api/auth/settings/printer/route.js`
- `src/app/[locale]/(app)/settings/*`
- `src/app/[locale]/pos/pos-checkout-view.jsx`
