-- AlterTable
ALTER TABLE "credit_notes" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "debit_notes" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "credit_notes_businessProfileId_deletedAt_idx" ON "credit_notes"("businessProfileId", "deletedAt");

-- CreateIndex
CREATE INDEX "debit_notes_businessProfileId_deletedAt_idx" ON "debit_notes"("businessProfileId", "deletedAt");

-- CreateIndex
CREATE INDEX "invoices_businessProfileId_deletedAt_idx" ON "invoices"("businessProfileId", "deletedAt");
