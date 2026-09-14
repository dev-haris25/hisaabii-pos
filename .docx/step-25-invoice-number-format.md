# Step 25 — Invoice numbers as INV-0001

## Change
POS checkout now allocates human-facing invoice numbers as `INV-0001`, `INV-0002`, … (4-digit zero padding; grows past 4 digits when needed).

## Files
- `src/lib/pos/checkout-pos-sale.js` — `formatInvoiceNumber` + `allocateInvoiceNumber`

## Notes
- Counter sequence is unchanged (`InvoiceCounter.lastNumber`); only the display string format changed.
- Existing invoices keep their previous numbers; new sales get `INV-####`.
