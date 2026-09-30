-- Soft-delete coupons (deletedAt) and allow code reuse after delete.
-- CouponCode.code becomes nullable so UNIQUE_BATCH codes can be cleared on soft delete.
-- CouponUsage.codeSnapshot remains the historical record of the typed code.

ALTER TABLE "coupons" ADD COLUMN "deletedAt" TIMESTAMP(3);

CREATE INDEX "coupons_businessProfileId_deletedAt_idx" ON "coupons"("businessProfileId", "deletedAt");

ALTER TABLE "coupon_codes" ALTER COLUMN "code" DROP NOT NULL;
