'use client'

import { SalarySlipFormPage } from '@/components/hr/salary-slip-form-page'

/** @param {{ hasBusinessProfile?: boolean }} props */
export function AddSalarySlipPageClient({ hasBusinessProfile }) {
  return <SalarySlipFormPage mode="add" hasBusinessProfile={hasBusinessProfile} />
}
