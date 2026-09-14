export const salarySlipPrintInclude = {
  employee: {
    select: {
      id: true,
      name: true,
      emailOfficial: true,
      emailPersonal: true,
      idNumber: true,
      joiningDate: true,
      bankAccountName: true,
      bankAccountNumber: true,
      bankName: true,
      bankIban: true,
    },
  },
  createdByUser: { select: { id: true, name: true, email: true } },
  lines: {
    orderBy: { sortOrder: 'asc' },
    include: { payslipCategory: { select: { id: true, name: true, type: true } } },
  },
}
