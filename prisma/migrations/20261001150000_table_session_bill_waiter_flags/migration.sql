-- E-Waiter: Ask-for-Bill + Call Waiter flags on TableSession.

ALTER TABLE "table_sessions"
ADD COLUMN "billRequestedAt" TIMESTAMP(3),
ADD COLUMN "requestedRedeemPoints" TEXT,
ADD COLUMN "waiterCallRequestedAt" TIMESTAMP(3),
ADD COLUMN "waiterCallResolvedAt" TIMESTAMP(3);

CREATE INDEX "table_sessions_businessProfileId_billRequestedAt_idx" ON "table_sessions"("businessProfileId", "billRequestedAt");

CREATE INDEX "table_sessions_businessProfileId_waiterCallRequestedAt_idx" ON "table_sessions"("businessProfileId", "waiterCallRequestedAt");