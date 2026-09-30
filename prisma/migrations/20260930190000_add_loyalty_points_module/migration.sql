-- CreateEnum
CREATE TYPE "LoyaltyTransactionType" AS ENUM ('EARN', 'REDEEM');

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN "loyaltyAccountId" TEXT,
ADD COLUMN "loyaltyDiscountAmount" TEXT,
ADD COLUMN "loyaltyPointsAwarded" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "loyaltyPointsRedeemed" TEXT;

-- AlterTable
ALTER TABLE "menu_items" ADD COLUMN "loyaltyRedeemable" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "loyalty_settings" (
    "businessProfileId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "earnRateAmount" TEXT NOT NULL,
    "earnRatePoints" TEXT NOT NULL,
    "redeemRatePoints" TEXT NOT NULL,
    "redeemRateAmount" TEXT NOT NULL,
    "minBalanceToRedeem" TEXT,
    "maxPointsPerOrder" TEXT,
    "minOrderValueToRedeem" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "loyalty_settings_pkey" PRIMARY KEY ("businessProfileId")
);

-- CreateTable
CREATE TABLE "loyalty_accounts" (
    "id" TEXT NOT NULL,
    "businessProfileId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "balance" TEXT NOT NULL DEFAULT '0',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "loyalty_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loyalty_transactions" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "type" "LoyaltyTransactionType" NOT NULL,
    "points" TEXT NOT NULL,
    "discountAmount" TEXT,
    "cashierUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loyalty_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "loyalty_accounts_businessProfileId_idx" ON "loyalty_accounts"("businessProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "loyalty_accounts_businessProfileId_phone_key" ON "loyalty_accounts"("businessProfileId", "phone");

-- CreateIndex
CREATE INDEX "loyalty_transactions_accountId_idx" ON "loyalty_transactions"("accountId");

-- CreateIndex
CREATE INDEX "loyalty_transactions_invoiceId_idx" ON "loyalty_transactions"("invoiceId");

-- CreateIndex
CREATE INDEX "loyalty_transactions_cashierUserId_idx" ON "loyalty_transactions"("cashierUserId");

-- CreateIndex
CREATE INDEX "invoices_loyaltyAccountId_idx" ON "invoices"("loyaltyAccountId");

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_loyaltyAccountId_fkey" FOREIGN KEY ("loyaltyAccountId") REFERENCES "loyalty_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_settings" ADD CONSTRAINT "loyalty_settings_businessProfileId_fkey" FOREIGN KEY ("businessProfileId") REFERENCES "business_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_accounts" ADD CONSTRAINT "loyalty_accounts_businessProfileId_fkey" FOREIGN KEY ("businessProfileId") REFERENCES "business_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_transactions" ADD CONSTRAINT "loyalty_transactions_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "loyalty_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_transactions" ADD CONSTRAINT "loyalty_transactions_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_transactions" ADD CONSTRAINT "loyalty_transactions_cashierUserId_fkey" FOREIGN KEY ("cashierUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
