'use client'

import { useCallback, useMemo, useState } from 'react'

import {
  joinInvoiceAddressAr,
  joinInvoiceAddressEn,
} from '@/lib/invoices/join-invoice-address'

/**
 * Structured ZATCA invoice address lines (seller / company profile).
 */
export function useCompanyInvoiceAddressFields() {
  const [streetEn, setStreetEn] = useState('')
  const [streetAr, setStreetAr] = useState('')
  const [districtEn, setDistrictEn] = useState('')
  const [districtAr, setDistrictAr] = useState('')
  const [cityEn, setCityEn] = useState('')
  const [cityAr, setCityAr] = useState('')
  const [buildingNumber, setBuildingNumber] = useState('')
  const [secondaryNumber, setSecondaryNumber] = useState('')
  const [postalCode, setPostalCode] = useState('')
  const [shortAddress, setShortAddress] = useState('')

  const composedInvoiceAddressAr = useMemo(
    () =>
      joinInvoiceAddressAr({
        streetAr,
        districtAr,
        cityAr,
        buildingNumber,
        secondaryNumber,
        postalCode,
      }),
    [streetAr, districtAr, cityAr, buildingNumber, secondaryNumber, postalCode],
  )

  const composedInvoiceAddressEn = useMemo(
    () =>
      joinInvoiceAddressEn({
        streetEn,
        districtEn,
        cityEn,
        buildingNumber,
        secondaryNumber,
        postalCode,
      }),
    [streetEn, districtEn, cityEn, buildingNumber, secondaryNumber, postalCode],
  )

  /** @param {Record<string, unknown> | null | undefined} p */
  const hydrateAddressFromProfile = useCallback((p) => {
    if (!p) return
    setStreetEn(String(p.streetEn ?? ''))
    setStreetAr(String(p.streetAr ?? ''))
    setDistrictEn(String(p.districtEn ?? ''))
    setDistrictAr(String(p.districtAr ?? ''))
    setCityEn(String(p.cityEn ?? ''))
    setCityAr(String(p.cityAr ?? ''))
    setBuildingNumber(String(p.buildingNumber ?? ''))
    setSecondaryNumber(String(p.secondaryNumber ?? ''))
    setPostalCode(String(p.postalCode ?? ''))
    setShortAddress(String(p.shortAddress ?? ''))
  }, [])

  /**
   * @param {{
   *   streetEn?: string
   *   streetAr?: string
   *   districtEn?: string
   *   districtAr?: string
   *   cityEn?: string
   *   cityAr?: string
   * }} next
   */
  const applyAddressFromConfirm = useCallback((next) => {
    if (!('streetEn' in next)) return
    setStreetEn(String(next.streetEn ?? ''))
    setStreetAr(String(next.streetAr ?? ''))
    setDistrictEn(String(next.districtEn ?? ''))
    setDistrictAr(String(next.districtAr ?? ''))
    setCityEn(String(next.cityEn ?? ''))
    setCityAr(String(next.cityAr ?? ''))
  }, [])

  return {
    streetEn,
    setStreetEn,
    streetAr,
    setStreetAr,
    districtEn,
    setDistrictEn,
    districtAr,
    setDistrictAr,
    cityEn,
    setCityEn,
    cityAr,
    setCityAr,
    buildingNumber,
    setBuildingNumber,
    secondaryNumber,
    setSecondaryNumber,
    postalCode,
    setPostalCode,
    shortAddress,
    setShortAddress,
    composedInvoiceAddressAr,
    composedInvoiceAddressEn,
    hydrateAddressFromProfile,
    applyAddressFromConfirm,
  }
}
