-- Link TableSession to LoyaltyAccount only at real order-submit time.

ALTER TABLE "table_sessions"
ADD COLUMN "loyaltyAccountId" TEXT;

CREATE INDEX "table_sessions_loyaltyAccountId_idx" ON "table_sessions"("loyaltyAccountId");

ALTER TABLE "table_sessions"
ADD CONSTRAINT "table_sessions_loyaltyAccountId_fkey"
FOREIGN KEY ("loyaltyAccountId") REFERENCES "loyalty_accounts"("id")
ON DELETE SET NULL ON UPDATE CASCADE;