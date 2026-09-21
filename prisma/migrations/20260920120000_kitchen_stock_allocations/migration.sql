-- Consumption-based kitchen stock allocations (replace daily StockDay).

-- Add new movement type (legacy allotment_* kept for history).
ALTER TYPE "StockMovementType" ADD VALUE 'kitchen_stock_issue';

CREATE TYPE "KitchenStockAllocationStatus" AS ENUM ('open', 'closed');

CREATE TABLE "kitchen_stock_allocations" (
    "id" TEXT NOT NULL,
    "businessProfileId" TEXT NOT NULL,
    "stockItemId" TEXT NOT NULL,
    "status" "KitchenStockAllocationStatus" NOT NULL DEFAULT 'open',
    "quantityIssued" TEXT NOT NULL DEFAULT '0',
    "quantityUsed" TEXT NOT NULL DEFAULT '0',
    "quantityWaste" TEXT,
    "isBulkAtClose" BOOLEAN,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "openedByUserId" TEXT,
    "closedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kitchen_stock_allocations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "kitchen_stock_allocations_businessProfileId_status_idx" ON "kitchen_stock_allocations"("businessProfileId", "status");
CREATE INDEX "kitchen_stock_allocations_businessProfileId_stockItemId_status_idx" ON "kitchen_stock_allocations"("businessProfileId", "stockItemId", "status");
CREATE INDEX "kitchen_stock_allocations_stockItemId_idx" ON "kitchen_stock_allocations"("stockItemId");
CREATE INDEX "kitchen_stock_allocations_businessProfileId_closedAt_idx" ON "kitchen_stock_allocations"("businessProfileId", "closedAt");

ALTER TABLE "kitchen_stock_allocations" ADD CONSTRAINT "kitchen_stock_allocations_businessProfileId_fkey" FOREIGN KEY ("businessProfileId") REFERENCES "business_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "kitchen_stock_allocations" ADD CONSTRAINT "kitchen_stock_allocations_stockItemId_fkey" FOREIGN KEY ("stockItemId") REFERENCES "stock_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Drop daily allotment tables.
DROP TABLE IF EXISTS "stock_day_lines";
DROP TABLE IF EXISTS "stock_days";
DROP TYPE IF EXISTS "StockDayStatus";
