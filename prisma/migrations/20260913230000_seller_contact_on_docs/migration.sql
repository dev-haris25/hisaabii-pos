-- Snapshot restaurant contact onto invoices and credit/debit notes for receipts
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "sellerEmail" TEXT;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "sellerPhone" TEXT;

ALTER TABLE "credit_notes" ADD COLUMN IF NOT EXISTS "sellerEmail" TEXT;
ALTER TABLE "credit_notes" ADD COLUMN IF NOT EXISTS "sellerPhone" TEXT;

ALTER TABLE "debit_notes" ADD COLUMN IF NOT EXISTS "sellerEmail" TEXT;
ALTER TABLE "debit_notes" ADD COLUMN IF NOT EXISTS "sellerPhone" TEXT;
