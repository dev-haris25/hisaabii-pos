-- CreateEnum
CREATE TYPE "OfferKind" AS ENUM ('DISCOUNT', 'BUY_X_GET_Y', 'COMBO');

-- CreateEnum
CREATE TYPE "OfferDiscountType" AS ENUM ('PERCENTAGE', 'FIXED_AMOUNT');

-- CreateEnum
CREATE TYPE "OfferItemRole" AS ENUM ('TARGET', 'BUY', 'GET', 'COMBO_ITEM');

-- AlterTable
ALTER TABLE "invoice_lines" ADD COLUMN     "offerGroupKey" TEXT,
ADD COLUMN     "offerId" TEXT;

-- AlterTable
ALTER TABLE "table_session_lines" ADD COLUMN     "offerDiscount" TEXT,
ADD COLUMN     "offerGroupKey" TEXT,
ADD COLUMN     "offerId" TEXT;

-- CreateTable
CREATE TABLE "offers" (
    "id" TEXT NOT NULL,
    "businessProfileId" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT,
    "kind" "OfferKind" NOT NULL,
    "discountType" "OfferDiscountType",
    "discountValue" TEXT,
    "appliesToAllItems" BOOLEAN NOT NULL DEFAULT false,
    "comboPrice" TEXT,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "dailyStartMinute" INTEGER,
    "dailyEndMinute" INTEGER,
    "weekdays" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "totalUsageLimit" INTEGER,
    "dailyUsageLimit" INTEGER,
    "maxPerOrder" INTEGER,
    "bannerImagePath" TEXT,
    "imagePath" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offer_items" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "role" "OfferItemRole" NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "discountPercent" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "offer_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offer_item_variant_options" (
    "id" TEXT NOT NULL,
    "offerItemId" TEXT NOT NULL,
    "variantOptionId" TEXT NOT NULL,

    CONSTRAINT "offer_item_variant_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offer_usages" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "businessProfileId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "kitchenOrderId" TEXT,
    "quantity" INTEGER NOT NULL,
    "riyadhDay" TEXT NOT NULL,
    "discountAmount" TEXT NOT NULL,
    "releasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "offer_usages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "offers_businessProfileId_active_deletedAt_idx" ON "offers"("businessProfileId", "active", "deletedAt");

-- CreateIndex
CREATE INDEX "offer_items_offerId_idx" ON "offer_items"("offerId");

-- CreateIndex
CREATE INDEX "offer_items_menuItemId_idx" ON "offer_items"("menuItemId");

-- CreateIndex
CREATE INDEX "offer_item_variant_options_variantOptionId_idx" ON "offer_item_variant_options"("variantOptionId");

-- CreateIndex
CREATE UNIQUE INDEX "offer_item_variant_options_offerItemId_variantOptionId_key" ON "offer_item_variant_options"("offerItemId", "variantOptionId");

-- CreateIndex
CREATE INDEX "offer_usages_offerId_releasedAt_idx" ON "offer_usages"("offerId", "releasedAt");

-- CreateIndex
CREATE INDEX "offer_usages_offerId_riyadhDay_idx" ON "offer_usages"("offerId", "riyadhDay");

-- CreateIndex
CREATE INDEX "offer_usages_invoiceId_idx" ON "offer_usages"("invoiceId");

-- CreateIndex
CREATE INDEX "offer_usages_kitchenOrderId_idx" ON "offer_usages"("kitchenOrderId");

-- CreateIndex
CREATE INDEX "invoice_lines_offerId_idx" ON "invoice_lines"("offerId");

-- CreateIndex
CREATE INDEX "table_session_lines_offerId_idx" ON "table_session_lines"("offerId");

-- AddForeignKey
ALTER TABLE "table_session_lines" ADD CONSTRAINT "table_session_lines_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "offers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "offers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offers" ADD CONSTRAINT "offers_businessProfileId_fkey" FOREIGN KEY ("businessProfileId") REFERENCES "business_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offer_items" ADD CONSTRAINT "offer_items_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "offers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offer_items" ADD CONSTRAINT "offer_items_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "menu_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offer_item_variant_options" ADD CONSTRAINT "offer_item_variant_options_offerItemId_fkey" FOREIGN KEY ("offerItemId") REFERENCES "offer_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offer_item_variant_options" ADD CONSTRAINT "offer_item_variant_options_variantOptionId_fkey" FOREIGN KEY ("variantOptionId") REFERENCES "menu_item_variant_options"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offer_usages" ADD CONSTRAINT "offer_usages_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "offers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offer_usages" ADD CONSTRAINT "offer_usages_businessProfileId_fkey" FOREIGN KEY ("businessProfileId") REFERENCES "business_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offer_usages" ADD CONSTRAINT "offer_usages_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offer_usages" ADD CONSTRAINT "offer_usages_kitchenOrderId_fkey" FOREIGN KEY ("kitchenOrderId") REFERENCES "kitchen_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
