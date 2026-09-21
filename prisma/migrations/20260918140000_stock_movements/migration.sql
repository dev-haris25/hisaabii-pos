-- Stock movements ledger (Step 2)

CREATE TYPE "StockMovementType" AS ENUM ('purchase', 'adjust_in', 'adjust_out', 'opening');

CREATE TABLE "stock_movements" (
    "id" TEXT NOT NULL,
    "businessProfileId" TEXT NOT NULL,
    "stockItemId" TEXT NOT NULL,
    "type" "StockMovementType" NOT NULL,
    "quantity" TEXT NOT NULL,
    "unit" "StockUnit" NOT NULL,
    "quantityBefore" TEXT NOT NULL,
    "quantityAfter" TEXT NOT NULL,
    "reason" TEXT,
    "note" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "stock_movements_businessProfileId_createdAt_idx" ON "stock_movements"("businessProfileId", "createdAt");
CREATE INDEX "stock_movements_stockItemId_createdAt_idx" ON "stock_movements"("stockItemId", "createdAt");

ALTER TABLE "stock_movements"
  ADD CONSTRAINT "stock_movements_businessProfileId_fkey"
  FOREIGN KEY ("businessProfileId") REFERENCES "business_profiles"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "stock_movements"
  ADD CONSTRAINT "stock_movements_stockItemId_fkey"
  FOREIGN KEY ("stockItemId") REFERENCES "stock_items"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "stock_movements"
  ADD CONSTRAINT "stock_movements_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
