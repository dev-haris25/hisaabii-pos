-- Daily allotment (MVP 2 Step 4)

CREATE TYPE "StockDayStatus" AS ENUM ('open', 'closed');

ALTER TYPE "StockMovementType" ADD VALUE 'allotment_issue';
ALTER TYPE "StockMovementType" ADD VALUE 'allotment_return';

CREATE TABLE "stock_days" (
    "id" TEXT NOT NULL,
    "businessProfileId" TEXT NOT NULL,
    "businessDate" DATE NOT NULL,
    "status" "StockDayStatus" NOT NULL DEFAULT 'open',
    "allowMainStockIfNoAllotment" BOOLEAN NOT NULL DEFAULT false,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "openedByUserId" TEXT,
    "closedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_days_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "stock_day_lines" (
    "id" TEXT NOT NULL,
    "stockDayId" TEXT NOT NULL,
    "stockItemId" TEXT NOT NULL,
    "quantityAllotted" TEXT NOT NULL DEFAULT '0',
    "quantityReturned" TEXT NOT NULL DEFAULT '0',
    "quantityUsedFromAllotment" TEXT NOT NULL DEFAULT '0',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_day_lines_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "stock_days_businessProfileId_businessDate_key" ON "stock_days"("businessProfileId", "businessDate");
CREATE INDEX "stock_days_businessProfileId_status_idx" ON "stock_days"("businessProfileId", "status");

CREATE UNIQUE INDEX "stock_day_lines_stockDayId_stockItemId_key" ON "stock_day_lines"("stockDayId", "stockItemId");
CREATE INDEX "stock_day_lines_stockItemId_idx" ON "stock_day_lines"("stockItemId");

ALTER TABLE "stock_days" ADD CONSTRAINT "stock_days_businessProfileId_fkey" FOREIGN KEY ("businessProfileId") REFERENCES "business_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "stock_day_lines" ADD CONSTRAINT "stock_day_lines_stockDayId_fkey" FOREIGN KEY ("stockDayId") REFERENCES "stock_days"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "stock_day_lines" ADD CONSTRAINT "stock_day_lines_stockItemId_fkey" FOREIGN KEY ("stockItemId") REFERENCES "stock_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
