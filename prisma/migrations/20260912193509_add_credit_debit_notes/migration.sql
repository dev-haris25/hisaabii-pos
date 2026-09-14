-- CreateTable
CREATE TABLE "credit_note_counters" (
    "businessProfileId" TEXT NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "credit_note_counters_pkey" PRIMARY KEY ("businessProfileId")
);

-- CreateTable
CREATE TABLE "debit_note_counters" (
    "businessProfileId" TEXT NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "debit_note_counters_pkey" PRIMARY KEY ("businessProfileId")
);

-- CreateTable
CREATE TABLE "credit_notes" (
    "id" TEXT NOT NULL,
    "businessProfileId" TEXT NOT NULL,
    "creditNoteNumber" TEXT NOT NULL,
    "noteDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "invoiceId" TEXT,
    "invoiceNumberSnapshot" TEXT NOT NULL,
    "invoiceUuidSnapshot" TEXT NOT NULL DEFAULT '',
    "invoiceIssueDateSnapshot" TIMESTAMP(3),
    "reasonAr" TEXT NOT NULL,
    "reasonEn" TEXT,
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
    "subtotal" TEXT NOT NULL,
    "totalVat" TEXT NOT NULL,
    "grandTotal" TEXT NOT NULL,
    "xmlPayload" TEXT,
    "qrCode" TEXT,
    "cryptographicStamp" TEXT,
    "pih" TEXT,
    "zatcaStatus" "ZatcaClearanceStatus",
    "zatcaClearedAt" TIMESTAMP(3),
    "zatcaReportAttempts" INTEGER NOT NULL DEFAULT 0,
    "zatcaLastAttemptAt" TIMESTAMP(3),
    "zatcaLastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credit_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_note_lines" (
    "id" TEXT NOT NULL,
    "creditNoteId" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT,
    "quantity" INTEGER NOT NULL,
    "unitPrice" TEXT NOT NULL,
    "vatPreset" "VatPreset" NOT NULL,
    "vatAmount" TEXT NOT NULL,
    "lineTotal" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "credit_note_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "debit_notes" (
    "id" TEXT NOT NULL,
    "businessProfileId" TEXT NOT NULL,
    "debitNoteNumber" TEXT NOT NULL,
    "noteDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "invoiceId" TEXT,
    "invoiceNumberSnapshot" TEXT NOT NULL,
    "invoiceUuidSnapshot" TEXT NOT NULL DEFAULT '',
    "invoiceIssueDateSnapshot" TIMESTAMP(3),
    "reasonAr" TEXT NOT NULL,
    "reasonEn" TEXT,
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
    "subtotal" TEXT NOT NULL,
    "totalVat" TEXT NOT NULL,
    "grandTotal" TEXT NOT NULL,
    "xmlPayload" TEXT,
    "qrCode" TEXT,
    "cryptographicStamp" TEXT,
    "pih" TEXT,
    "zatcaStatus" "ZatcaClearanceStatus",
    "zatcaClearedAt" TIMESTAMP(3),
    "zatcaReportAttempts" INTEGER NOT NULL DEFAULT 0,
    "zatcaLastAttemptAt" TIMESTAMP(3),
    "zatcaLastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "debit_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "debit_note_lines" (
    "id" TEXT NOT NULL,
    "debitNoteId" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT,
    "quantity" INTEGER NOT NULL,
    "unitPrice" TEXT NOT NULL,
    "vatPreset" "VatPreset" NOT NULL,
    "vatAmount" TEXT NOT NULL,
    "lineTotal" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "debit_note_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "credit_notes_businessProfileId_zatcaStatus_idx" ON "credit_notes"("businessProfileId", "zatcaStatus");

-- CreateIndex
CREATE INDEX "credit_notes_businessProfileId_noteDate_idx" ON "credit_notes"("businessProfileId", "noteDate");

-- CreateIndex
CREATE INDEX "credit_notes_invoiceId_idx" ON "credit_notes"("invoiceId");

-- CreateIndex
CREATE INDEX "credit_notes_createdByStaffId_idx" ON "credit_notes"("createdByStaffId");

-- CreateIndex
CREATE UNIQUE INDEX "credit_notes_businessProfileId_creditNoteNumber_key" ON "credit_notes"("businessProfileId", "creditNoteNumber");

-- CreateIndex
CREATE INDEX "credit_note_lines_creditNoteId_idx" ON "credit_note_lines"("creditNoteId");

-- CreateIndex
CREATE INDEX "debit_notes_businessProfileId_zatcaStatus_idx" ON "debit_notes"("businessProfileId", "zatcaStatus");

-- CreateIndex
CREATE INDEX "debit_notes_businessProfileId_noteDate_idx" ON "debit_notes"("businessProfileId", "noteDate");

-- CreateIndex
CREATE INDEX "debit_notes_invoiceId_idx" ON "debit_notes"("invoiceId");

-- CreateIndex
CREATE INDEX "debit_notes_createdByStaffId_idx" ON "debit_notes"("createdByStaffId");

-- CreateIndex
CREATE UNIQUE INDEX "debit_notes_businessProfileId_debitNoteNumber_key" ON "debit_notes"("businessProfileId", "debitNoteNumber");

-- CreateIndex
CREATE INDEX "debit_note_lines_debitNoteId_idx" ON "debit_note_lines"("debitNoteId");

-- AddForeignKey
ALTER TABLE "credit_note_counters" ADD CONSTRAINT "credit_note_counters_businessProfileId_fkey" FOREIGN KEY ("businessProfileId") REFERENCES "business_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debit_note_counters" ADD CONSTRAINT "debit_note_counters_businessProfileId_fkey" FOREIGN KEY ("businessProfileId") REFERENCES "business_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_businessProfileId_fkey" FOREIGN KEY ("businessProfileId") REFERENCES "business_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_createdByStaffId_fkey" FOREIGN KEY ("createdByStaffId") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_note_lines" ADD CONSTRAINT "credit_note_lines_creditNoteId_fkey" FOREIGN KEY ("creditNoteId") REFERENCES "credit_notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debit_notes" ADD CONSTRAINT "debit_notes_businessProfileId_fkey" FOREIGN KEY ("businessProfileId") REFERENCES "business_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debit_notes" ADD CONSTRAINT "debit_notes_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debit_notes" ADD CONSTRAINT "debit_notes_createdByStaffId_fkey" FOREIGN KEY ("createdByStaffId") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debit_note_lines" ADD CONSTRAINT "debit_note_lines_debitNoteId_fkey" FOREIGN KEY ("debitNoteId") REFERENCES "debit_notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
