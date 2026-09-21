-- Per-recipe usage lines on kitchen stock allocations (wastage report detail).

CREATE TABLE "kitchen_stock_usage_lines" (
    "id" TEXT NOT NULL,
    "allocationId" TEXT NOT NULL,
    "kitchenOrderId" TEXT,
    "menuItemId" TEXT,
    "menuItemNameAr" TEXT NOT NULL,
    "menuItemNameEn" TEXT,
    "servings" INTEGER NOT NULL DEFAULT 1,
    "quantityUsed" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kitchen_stock_usage_lines_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "kitchen_stock_usage_lines_allocationId_createdAt_idx" ON "kitchen_stock_usage_lines"("allocationId", "createdAt");
CREATE INDEX "kitchen_stock_usage_lines_menuItemId_idx" ON "kitchen_stock_usage_lines"("menuItemId");

ALTER TABLE "kitchen_stock_usage_lines" ADD CONSTRAINT "kitchen_stock_usage_lines_allocationId_fkey" FOREIGN KEY ("allocationId") REFERENCES "kitchen_stock_allocations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
