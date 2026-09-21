-- CreateEnum
CREATE TYPE "KitchenWasteSeverity" AS ENUM ('low', 'bearable', 'high');

-- AlterTable
ALTER TABLE "kitchen_stock_allocations" ADD COLUMN "aiQuantityUsed" TEXT,
ADD COLUMN "wasteIsAiEstimate" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "wasteSeverity" "KitchenWasteSeverity",
ADD COLUMN "aiAnalysis" TEXT,
ADD COLUMN "aiAnalyzedAt" TIMESTAMP(3);
