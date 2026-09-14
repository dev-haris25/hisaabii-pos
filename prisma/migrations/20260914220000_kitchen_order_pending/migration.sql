-- AlterEnum
ALTER TYPE "KitchenOrderStatus" ADD VALUE 'pending';

-- AlterTable
ALTER TABLE "kitchen_orders" ADD COLUMN "completedAt" TIMESTAMP(3);

-- Backfill served timestamps so the 24h completed tab has a cutoff.
UPDATE "kitchen_orders"
SET "completedAt" = "updatedAt"
WHERE "status" = 'completed' AND "completedAt" IS NULL;
