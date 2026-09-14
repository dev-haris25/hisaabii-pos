'use client'

import { EmployeeFormPage } from '@/components/hr/employee-form-page'

/** @param {{ hasBusinessProfile?: boolean }} props */
export function AddEmployeePageClient({ hasBusinessProfile }) {
  return <EmployeeFormPage mode="add" hasBusinessProfile={hasBusinessProfile} />
}
