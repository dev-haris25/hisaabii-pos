/*
  Warnings:

  - You are about to drop the column `primaryPosTillId` on the `business_profiles` table. All the data in the column will be lost.
  - You are about to drop the column `lastHeartbeatAt` on the `pos_tills` table. All the data in the column will be lost.
  - You are about to drop the column `pendingUploadCount` on the `pos_tills` table. All the data in the column will be lost.
  - You are about to drop the `sync_processed_events` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "business_profiles" DROP CONSTRAINT IF EXISTS "business_profiles_primaryPosTillId_fkey";

-- DropForeignKey
ALTER TABLE IF EXISTS "sync_processed_events" DROP CONSTRAINT IF EXISTS "sync_processed_events_businessProfileId_fkey";

-- DropForeignKey
ALTER TABLE IF EXISTS "sync_processed_events" DROP CONSTRAINT IF EXISTS "sync_processed_events_posTillId_fkey";

-- DropIndex
DROP INDEX IF EXISTS "business_profiles_primaryPosTillId_key";

-- AlterTable
ALTER TABLE "business_profiles" DROP COLUMN IF EXISTS "primaryPosTillId";

-- AlterTable
ALTER TABLE "kitchen_orders" ALTER COLUMN "status" SET DEFAULT 'pending';

-- AlterTable
ALTER TABLE "pos_tills" DROP COLUMN IF EXISTS "lastHeartbeatAt",
DROP COLUMN IF EXISTS "pendingUploadCount";

-- DropTable
DROP TABLE IF EXISTS "sync_processed_events";

-- RenameIndex
ALTER INDEX IF EXISTS "coupon_item_rule_variant_options_couponItemRuleId_variantOption" RENAME TO "coupon_item_rule_variant_options_couponItemRuleId_variantOp_key";

-- RenameIndex
ALTER INDEX IF EXISTS "kitchen_stock_allocations_businessProfileId_stockItemId_status_" RENAME TO "kitchen_stock_allocations_businessProfileId_stockItemId_sta_idx";
