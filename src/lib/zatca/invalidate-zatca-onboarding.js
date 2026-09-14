/**
 * Clears production/compliance CSIDs and resets counters so the company must
 * complete ZATCA onboarding again (e.g. after VAT/CR change).
 *
 * @param {import('@/generated/prisma/client').Prisma.TransactionClient | import('@/generated/prisma/client').PrismaClient} tx
 * @param {string} businessProfileId
 */
export async function invalidateZatcaOnboardingForProfile(tx, businessProfileId) {
  await tx.zatcaDevice.updateMany({
    where: { businessProfileId },
    data: {
      complianceCsid: null,
      complianceSecretEnc: null,
      complianceRequestId: null,
      productionCsid: null,
      productionSecretEnc: null,
      lastInvoiceHash: '',
      invoiceCounter: 0,
      onboardedAt: null,
    },
  })

  await tx.businessProfile.update({
    where: { id: businessProfileId },
    data: { zatcaOnboardingSkipped: false },
  })
}
