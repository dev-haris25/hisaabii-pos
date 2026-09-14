import { assertCompletePostalAddressFields } from '@/lib/zatca/postal-address-from-fields'

/**
 * Validate seller / supplier party data before ZATCA XML generation or onboarding.
 * Rejects legacy incomplete profiles instead of substituting placeholder literals.
 *
 * @param {Record<string, unknown>} seller
 */
export function assertSellerPartyForZatca(seller) {
  const nameAr = String(
    seller.sellerCompanyNameAr ?? seller.companyNameAr ?? '',
  ).trim()
  const nameEn = String(
    seller.sellerCompanyNameEn ??
      seller.companyNameEn ??
      seller.sellerCompanyNameAr ??
      seller.companyNameAr ??
      '',
  ).trim()

  if (!nameAr && !nameEn) {
    const err = /** @type {const} */ ({
      code: 'SELLER_PROFILE_INCOMPLETE',
      message: 'Complete your company profile (company name) before ZATCA submission',
    })
    throw Object.assign(new Error(err.message), err)
  }

  const cr = String(seller.sellerCrNumber ?? seller.crNumber ?? '').trim()
  if (!cr) {
    const err = /** @type {const} */ ({
      code: 'SELLER_PROFILE_INCOMPLETE',
      message: 'Complete your company profile (CR number) before ZATCA submission',
    })
    throw Object.assign(new Error(err.message), err)
  }

  assertCompletePostalAddressFields(
    {
      streetAr: seller.sellerStreetAr ?? seller.streetAr,
      addressAr: seller.sellerAddressAr ?? seller.addressAr,
      districtAr: seller.sellerDistrictAr ?? seller.districtAr,
      cityAr: seller.sellerCityAr ?? seller.cityAr,
      buildingNumber: seller.sellerBuildingNumber ?? seller.buildingNumber,
      postalCode: seller.sellerPostalCode ?? seller.postalCode,
      countryCode: seller.sellerCountryCode ?? seller.countryCode ?? 'SA',
    },
    {
      partyLabel: 'Seller',
      code: 'SELLER_PROFILE_INCOMPLETE',
    },
  )
}

/**
 * @param {import('@/generated/prisma').BusinessProfile} profile
 */
export function assertBusinessProfileCompleteForZatca(profile) {
  assertSellerPartyForZatca(profile)
}
