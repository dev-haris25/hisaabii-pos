'use client'

import { HrLookupListView } from '@/components/hr/hr-lookup-list-view'

/** @param {{ hasBusinessProfile?: boolean }} props */
export function PayslipCategoriesListView({ hasBusinessProfile }) {
  return <HrLookupListView kind="payslipCategory" hasBusinessProfile={hasBusinessProfile} />
}
