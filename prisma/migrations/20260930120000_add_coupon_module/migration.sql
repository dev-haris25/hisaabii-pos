-- CreateEnum
CREATE TYPE "CouponCodeType" AS ENUM ('SHARED', 'UNIQUE_BATCH');

-- CreateEnum
CREATE TYPE "CouponDiscountKind" AS ENUM ('PERCENTAGE', 'FIXED_AMOUNT', 'BOGO', 'COMBO');

-- CreateEnum
CREATE TYPE "CouponItemRuleType" AS ENUM ('BUY', 'GET', 'COMBO_ITEM');

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN "couponCode" TEXT,
ADD COLUMN "couponId" TEXT,
ADD COLUMN "discountAmount" TEXT;

-- CreateTable
CREATE TABLE "coupons" (
    "id" TEXT NOT NULL,
    "businessProfileId" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT,
    "codeType" "CouponCodeType" NOT NULL,
    "code" TEXT,
    "batchSize" INTEGER,
    "discountKind" "CouponDiscountKind" NOT NULL,
    "discountValue" TEXT,
    "maxDiscountCap" TEXT,
    "minOrderAmount" TEXT NOT NULL DEFAULT '0',
    "totalUsageLimit" INTEGER,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "startDate" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coupons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coupon_codes" (
    "id" TEXT NOT NULL,
    "couponId" TEXT NOT NULL,
    "businessProfileId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "ticketNumber" INTEGER NOT NULL,
    "usageLimit" INTEGER,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coupon_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coupon_item_rules" (
    "id" TEXT NOT NULL,
    "couponId" TEXT NOT NULL,
    "ruleType" "CouponItemRuleType" NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "discountPercent" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "coupon_item_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coupon_usages" (
    "id" TEXT NOT NULL,
    "couponId" TEXT NOT NULL,
    "couponCodeId" TEXT,
    "invoiceId" TEXT NOT NULL,
    "cashierUserId" TEXT NOT NULL,
    "codeSnapshot" TEXT NOT NULL,
    "discountAmount" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coupon_usages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "coupons_businessProfileId_active_idx" ON "coupons"("businessProfileId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "coupons_businessProfileId_code_key" ON "coupons"("businessProfileId", "code");

-- CreateIndex
CREATE INDEX "coupon_codes_code_idx" ON "coupon_codes"("code");

-- CreateIndex
CREATE UNIQUE INDEX "coupon_codes_couponId_ticketNumber_key" ON "coupon_codes"("couponId", "ticketNumber");

-- CreateIndex
CREATE UNIQUE INDEX "coupon_codes_businessProfileId_code_key" ON "coupon_codes"("businessProfileId", "code");

-- CreateIndex
CREATE INDEX "coupon_item_rules_couponId_idx" ON "coupon_item_rules"("couponId");

-- CreateIndex
CREATE INDEX "coupon_item_rules_menuItemId_idx" ON "coupon_item_rules"("menuItemId");

-- CreateIndex
CREATE INDEX "coupon_usages_couponId_idx" ON "coupon_usages"("couponId");

-- CreateIndex
CREATE INDEX "coupon_usages_invoiceId_idx" ON "coupon_usages"("invoiceId");

-- CreateIndex
CREATE INDEX "coupon_usages_couponCodeId_idx" ON "coupon_usages"("couponCodeId");

-- CreateIndex
CREATE INDEX "coupon_usages_cashierUserId_idx" ON "coupon_usages"("cashierUserId");

-- CreateIndex
CREATE INDEX "invoices_couponId_idx" ON "invoices"("couponId");

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "coupons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_businessProfileId_fkey" FOREIGN KEY ("businessProfileId") REFERENCES "business_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_codes" ADD CONSTRAINT "coupon_codes_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "coupons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_codes" ADD CONSTRAINT "coupon_codes_businessProfileId_fkey" FOREIGN KEY ("businessProfileId") REFERENCES "business_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_item_rules" ADD CONSTRAINT "coupon_item_rules_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "coupons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_item_rules" ADD CONSTRAINT "coupon_item_rules_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "menu_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_usages" ADD CONSTRAINT "coupon_usages_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "coupons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_usages" ADD CONSTRAINT "coupon_usages_couponCodeId_fkey" FOREIGN KEY ("couponCodeId") REFERENCES "coupon_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_usages" ADD CONSTRAINT "coupon_usages_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_usages" ADD CONSTRAINT "coupon_usages_cashierUserId_fkey" FOREIGN KEY ("cashierUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
