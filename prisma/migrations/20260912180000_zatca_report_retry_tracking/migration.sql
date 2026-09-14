-- AlterTable: ZATCA background retry tracking (Step 10)
ALTER TABLE "invoices" ADD COLUMN "zatcaReportAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "invoices" ADD COLUMN "zatcaLastAttemptAt" TIMESTAMP(3);
ALTER TABLE "invoices" ADD COLUMN "zatcaLastError" TEXT;
ALTER TABLE "invoices" ADD COLUMN "zatcaDeadlineRetriedAt" TIMESTAMP(3);

CREATE INDEX "invoices_zatcaStatus_createdAt_idx" ON "invoices"("zatcaStatus", "createdAt");
CREATE INDEX "invoices_zatcaStatus_zatcaDeadlineRetriedAt_createdAt_idx" ON "invoices"("zatcaStatus", "zatcaDeadlineRetriedAt", "createdAt");
