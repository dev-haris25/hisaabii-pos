-- CreateEnum
CREATE TYPE "StockDayEndStatus" AS ENUM ('draft', 'submitted');

-- CreateTable
CREATE TABLE "stock_day_end_reports" (
    "id" TEXT NOT NULL,
    "businessProfileId" TEXT NOT NULL,
    "reportDate" DATE NOT NULL,
    "status" "StockDayEndStatus" NOT NULL DEFAULT 'draft',
    "submittedAt" TIMESTAMP(3),
    "submittedByUserId" TEXT,
    "aiAnalysis" TEXT,
    "aiAnalyzedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_day_end_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_day_end_lines" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "stockItemId" TEXT NOT NULL,
    "isBulk" BOOLEAN NOT NULL,
    "unit" "StockUnit" NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT,
    "recipeUsed" TEXT NOT NULL DEFAULT '0',
    "userUsed" TEXT,
    "quantityWaste" TEXT NOT NULL DEFAULT '0',
    "wasteSeverity" "KitchenWasteSeverity",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_day_end_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "stock_day_end_reports_businessProfileId_reportDate_key" ON "stock_day_end_reports"("businessProfileId", "reportDate");

-- CreateIndex
CREATE INDEX "stock_day_end_reports_businessProfileId_status_idx" ON "stock_day_end_reports"("businessProfileId", "status");

-- CreateIndex
CREATE INDEX "stock_day_end_lines_reportId_idx" ON "stock_day_end_lines"("reportId");

-- CreateIndex
CREATE INDEX "stock_day_end_lines_stockItemId_idx" ON "stock_day_end_lines"("stockItemId");

-- AddForeignKey
ALTER TABLE "stock_day_end_reports" ADD CONSTRAINT "stock_day_end_reports_businessProfileId_fkey" FOREIGN KEY ("businessProfileId") REFERENCES "business_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_day_end_lines" ADD CONSTRAINT "stock_day_end_lines_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "stock_day_end_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_day_end_lines" ADD CONSTRAINT "stock_day_end_lines_stockItemId_fkey" FOREIGN KEY ("stockItemId") REFERENCES "stock_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
