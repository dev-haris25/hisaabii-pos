-- Day-end used / waste snapshots on allotment lines (MVP 2 Step 5)

ALTER TABLE "stock_day_lines"
  ADD COLUMN "quantityUsedAtClose" TEXT,
  ADD COLUMN "quantityWaste" TEXT,
  ADD COLUMN "isBulkAtClose" BOOLEAN;
