# Step 43 — Receipt contact footer + printer hint cleanup

## What

- Snapshotted restaurant `email` / `phone` onto `Invoice`, `CreditNote`, and `DebitNote` as `sellerEmail` / `sellerPhone` at create time.
- Thermal preview and print-bridge print contact **after** the thank-you line (phone then email), only when set.
- Printer settings hint no longer mentions dry-run / leaving IP empty.

## Migration

`prisma/migrations/20260913230000_seller_contact_on_docs`
