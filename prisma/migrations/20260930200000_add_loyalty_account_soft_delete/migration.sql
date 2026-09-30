-- AlterTable
ALTER TABLE "loyalty_accounts" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "loyalty_accounts_businessProfileId_deletedAt_idx" ON "loyalty_accounts"("businessProfileId", "deletedAt");
