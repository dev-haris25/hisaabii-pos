-- CreateEnum
CREATE TYPE "StaffRole" AS ENUM ('ADMIN', 'CASHIER');

-- CreateEnum
CREATE TYPE "OtpPurpose" AS ENUM ('register', 'password_reset');

-- CreateEnum
CREATE TYPE "VatPreset" AS ENUM ('standard', 'zero', 'exempt');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('completed', 'voided');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('cash', 'card');

-- CreateEnum
CREATE TYPE "ZatcaClearanceStatus" AS ENUM ('pending', 'cleared', 'reported', 'failed');

-- CreateTable
CREATE TABLE "business_profiles" (
    "id" TEXT NOT NULL,
    "companyNameAr" TEXT NOT NULL,
    "companyNameEn" TEXT,
    "crNumber" TEXT NOT NULL,
    "vatNumber" TEXT NOT NULL,
    "addressAr" TEXT NOT NULL,
    "addressEn" TEXT,
    "streetAr" TEXT NOT NULL DEFAULT '',
    "streetEn" TEXT NOT NULL DEFAULT '',
    "districtAr" TEXT NOT NULL DEFAULT '',
    "districtEn" TEXT NOT NULL DEFAULT '',
    "cityAr" TEXT NOT NULL DEFAULT '',
    "cityEn" TEXT NOT NULL DEFAULT '',
    "buildingNumber" TEXT NOT NULL DEFAULT '',
    "secondaryNumber" TEXT NOT NULL DEFAULT '',
    "postalCode" TEXT NOT NULL DEFAULT '',
    "shortAddress" TEXT NOT NULL DEFAULT '',
    "email" TEXT,
    "phone" TEXT,
    "defaultVatPercent" TEXT NOT NULL DEFAULT '15',
    "logoMimeType" TEXT,
    "logoStoragePath" TEXT,
    "printerIp" TEXT,
    "printerPort" INTEGER NOT NULL DEFAULT 9100,
    "zatcaOnboardingSkipped" BOOLEAN NOT NULL DEFAULT false,
    "zatcaEnvironment" TEXT NOT NULL DEFAULT 'sandbox',
    "onboardingCompletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff" (
    "id" TEXT NOT NULL,
    "businessProfileId" TEXT NOT NULL,
    "role" "StaffRole" NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "email" TEXT,
    "passwordHash" TEXT,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "pinHash" TEXT,
    "pinLookupHash" TEXT,
    "preferredLocale" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "otp_codes" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "purpose" "OtpPurpose" NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "otp_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_categories" (
    "id" TEXT NOT NULL,
    "businessProfileId" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "menu_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_items" (
    "id" TEXT NOT NULL,
    "businessProfileId" TEXT NOT NULL,
    "categoryId" TEXT,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT,
    "price" TEXT NOT NULL,
    "vatPreset" "VatPreset" NOT NULL DEFAULT 'standard',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "imageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "menu_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_counters" (
    "businessProfileId" TEXT NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "invoice_counters_pkey" PRIMARY KEY ("businessProfileId")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "businessProfileId" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'completed',
    "type" TEXT NOT NULL DEFAULT 'simplified',
    "invoiceDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByStaffId" TEXT NOT NULL,
    "sellerCompanyNameAr" TEXT NOT NULL,
    "sellerCompanyNameEn" TEXT,
    "sellerVatNumber" TEXT NOT NULL,
    "sellerCrNumber" TEXT NOT NULL,
    "sellerAddressAr" TEXT NOT NULL,
    "sellerAddressEn" TEXT,
    "sellerStreetAr" TEXT NOT NULL DEFAULT '',
    "sellerStreetEn" TEXT NOT NULL DEFAULT '',
    "sellerDistrictAr" TEXT NOT NULL DEFAULT '',
    "sellerDistrictEn" TEXT NOT NULL DEFAULT '',
    "sellerCityAr" TEXT NOT NULL DEFAULT '',
    "sellerCityEn" TEXT NOT NULL DEFAULT '',
    "sellerBuildingNumber" TEXT NOT NULL DEFAULT '',
    "sellerSecondaryNumber" TEXT NOT NULL DEFAULT '',
    "sellerPostalCode" TEXT NOT NULL DEFAULT '',
    "sellerShortAddress" TEXT NOT NULL DEFAULT '',
    "sellerCountryCode" TEXT NOT NULL DEFAULT 'SA',
    "paymentMethod" "PaymentMethod" NOT NULL,
    "amountTendered" TEXT,
    "changeGiven" TEXT,
    "subtotal" TEXT NOT NULL,
    "totalVat" TEXT NOT NULL,
    "grandTotal" TEXT NOT NULL,
    "notes" TEXT,
    "xmlPayload" TEXT,
    "qrCode" TEXT,
    "cryptographicStamp" TEXT,
    "pih" TEXT,
    "zatcaStatus" "ZatcaClearanceStatus",
    "zatcaClearedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_lines" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "menuItemId" TEXT,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT,
    "quantity" INTEGER NOT NULL,
    "unitPrice" TEXT NOT NULL,
    "discount" TEXT NOT NULL DEFAULT '0',
    "vatPreset" "VatPreset" NOT NULL,
    "vatAmount" TEXT NOT NULL,
    "lineTotal" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "invoice_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "zatca_devices" (
    "id" TEXT NOT NULL,
    "businessProfileId" TEXT NOT NULL,
    "environment" TEXT NOT NULL DEFAULT 'sandbox',
    "egsSerialNumber" TEXT NOT NULL,
    "privateKeyEnc" TEXT NOT NULL,
    "complianceCsid" TEXT,
    "complianceSecretEnc" TEXT,
    "complianceRequestId" TEXT,
    "productionCsid" TEXT,
    "productionSecretEnc" TEXT,
    "lastInvoiceHash" TEXT NOT NULL DEFAULT '',
    "invoiceCounter" INTEGER NOT NULL DEFAULT 0,
    "onboardedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "zatca_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "businessProfileId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "link" TEXT,
    "dedupeKey" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "staff_email_key" ON "staff"("email");

-- CreateIndex
CREATE INDEX "staff_businessProfileId_role_active_idx" ON "staff"("businessProfileId", "role", "active");

-- CreateIndex
CREATE UNIQUE INDEX "staff_businessProfileId_pinLookupHash_key" ON "staff"("businessProfileId", "pinLookupHash");

-- CreateIndex
CREATE INDEX "otp_codes_staffId_purpose_idx" ON "otp_codes"("staffId", "purpose");

-- CreateIndex
CREATE INDEX "menu_categories_businessProfileId_active_sortOrder_idx" ON "menu_categories"("businessProfileId", "active", "sortOrder");

-- CreateIndex
CREATE INDEX "menu_items_businessProfileId_active_sortOrder_idx" ON "menu_items"("businessProfileId", "active", "sortOrder");

-- CreateIndex
CREATE INDEX "menu_items_categoryId_idx" ON "menu_items"("categoryId");

-- CreateIndex
CREATE INDEX "invoices_businessProfileId_zatcaStatus_idx" ON "invoices"("businessProfileId", "zatcaStatus");

-- CreateIndex
CREATE INDEX "invoices_businessProfileId_invoiceDate_idx" ON "invoices"("businessProfileId", "invoiceDate");

-- CreateIndex
CREATE INDEX "invoices_createdByStaffId_idx" ON "invoices"("createdByStaffId");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_businessProfileId_invoiceNumber_key" ON "invoices"("businessProfileId", "invoiceNumber");

-- CreateIndex
CREATE INDEX "invoice_lines_invoiceId_idx" ON "invoice_lines"("invoiceId");

-- CreateIndex
CREATE INDEX "invoice_lines_menuItemId_idx" ON "invoice_lines"("menuItemId");

-- CreateIndex
CREATE UNIQUE INDEX "zatca_devices_businessProfileId_key" ON "zatca_devices"("businessProfileId");

-- CreateIndex
CREATE INDEX "notifications_businessProfileId_readAt_createdAt_idx" ON "notifications"("businessProfileId", "readAt", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_businessProfileId_dedupeKey_key" ON "notifications"("businessProfileId", "dedupeKey");

-- AddForeignKey
ALTER TABLE "staff" ADD CONSTRAINT "staff_businessProfileId_fkey" FOREIGN KEY ("businessProfileId") REFERENCES "business_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "otp_codes" ADD CONSTRAINT "otp_codes_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_categories" ADD CONSTRAINT "menu_categories_businessProfileId_fkey" FOREIGN KEY ("businessProfileId") REFERENCES "business_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_businessProfileId_fkey" FOREIGN KEY ("businessProfileId") REFERENCES "business_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "menu_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_counters" ADD CONSTRAINT "invoice_counters_businessProfileId_fkey" FOREIGN KEY ("businessProfileId") REFERENCES "business_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_businessProfileId_fkey" FOREIGN KEY ("businessProfileId") REFERENCES "business_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_createdByStaffId_fkey" FOREIGN KEY ("createdByStaffId") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "menu_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zatca_devices" ADD CONSTRAINT "zatca_devices_businessProfileId_fkey" FOREIGN KEY ("businessProfileId") REFERENCES "business_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_businessProfileId_fkey" FOREIGN KEY ("businessProfileId") REFERENCES "business_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
