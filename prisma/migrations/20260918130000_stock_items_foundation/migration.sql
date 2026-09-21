-- Stock foundation (Step 1): stock items + restaurant stock settings

CREATE TYPE "StockUnit" AS ENUM ('piece', 'g', 'kg', 'ml', 'l');

ALTER TABLE "business_settings"
  ADD COLUMN "allowNegativeStock" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "lowStockAlertsEnabled" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "stock_items" (
    "id" TEXT NOT NULL,
    "businessProfileId" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT,
    "unit" "StockUnit" NOT NULL,
    "quantityOnHand" TEXT NOT NULL DEFAULT '0',
    "lowStockThreshold" TEXT,
    "unitCost" TEXT,
    "isBulk" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "stock_items_businessProfileId_active_idx" ON "stock_items"("businessProfileId", "active");
CREATE INDEX "stock_items_businessProfileId_nameAr_idx" ON "stock_items"("businessProfileId", "nameAr");

ALTER TABLE "stock_items"
  ADD CONSTRAINT "stock_items_businessProfileId_fkey"
  FOREIGN KEY ("businessProfileId") REFERENCES "business_profiles"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
