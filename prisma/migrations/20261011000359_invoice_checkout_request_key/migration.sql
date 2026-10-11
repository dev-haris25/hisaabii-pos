-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "checkoutRequestKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "invoices_businessProfileId_checkoutRequestKey_key" ON "invoices"("businessProfileId", "checkoutRequestKey");

