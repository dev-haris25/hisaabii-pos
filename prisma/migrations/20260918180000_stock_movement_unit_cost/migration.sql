-- AlterTable
ALTER TABLE "stock_movements" ADD COLUMN "unitCost" TEXT;

-- CreateIndex
CREATE INDEX "stock_movements_stockItemId_type_idx" ON "stock_movements"("stockItemId", "type");
