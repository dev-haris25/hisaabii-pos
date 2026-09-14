import { prismaProfileId } from '@/lib/auth/owned-restaurant-scope'
import { WHERE_NOT_DELETED } from '@/lib/db/soft-delete-scope'
import { computeEmployeeBalance } from '@/lib/hr/compute-employee-balance'
import { prisma } from '@/lib/prisma'
import { employeeExcludeOwnerWhere } from '@/lib/rbac/owner-admin-gates'
import { parseMoney, percentChange, toMoneyStr } from '@/lib/reports/money'

/**
 * @param {string | string[]} businessProfileId
 * @param {{ from: Date | null, to: Date | null }} range
 * @param {{ status?: 'completed' | 'voided', includeDeleted?: boolean }} [opts]
 */
function invoiceWhere(businessProfileId, range, opts = {}) {
  /** @type {import('@/generated/prisma/client').Prisma.InvoiceWhereInput} */
  const where = {
    businessProfileId: prismaProfileId(businessProfileId),
    ...(opts.includeDeleted ? {} : WHERE_NOT_DELETED),
  }
  if (opts.status) where.status = opts.status
  if (range.from || range.to) {
    where.invoiceDate = {}
    if (range.from) where.invoiceDate.gte = range.from
    if (range.to) where.invoiceDate.lte = range.to
  }
  return where
}

/**
 * @param {string} businessProfileId
 * @param {{ from: Date | null, to: Date | null }} params
 */
export async function querySalesReport(businessProfileId, params) {
  const invoices = await prisma.invoice.findMany({
    where: invoiceWhere(businessProfileId, params, { status: 'completed' }),
    orderBy: [{ invoiceDate: 'desc' }],
    include: {
      createdByStaff: { select: { id: true, name: true } },
    },
  })

  let totalSales = 0
  let totalVat = 0
  let totalGrand = 0
  const rows = invoices.map((inv) => {
    totalSales += parseMoney(inv.subtotal)
    totalVat += parseMoney(inv.totalVat)
    totalGrand += parseMoney(inv.grandTotal)
    return {
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      invoiceDate: inv.invoiceDate.toISOString(),
      cashierId: inv.createdByStaffId,
      cashierName: inv.createdByStaff?.name ?? '',
      paymentMethod: inv.paymentMethod,
      subtotal: inv.subtotal,
      totalVat: inv.totalVat,
      grandTotal: inv.grandTotal,
      status: inv.status,
      zatcaStatus: inv.zatcaStatus ?? '',
    }
  })

  const count = rows.length
  return {
    rows,
    totals: {
      totalSales: toMoneyStr(totalSales),
      totalVat: toMoneyStr(totalVat),
      grandTotal: toMoneyStr(totalGrand),
      invoiceCount: count,
      averageInvoiceValue: count > 0 ? toMoneyStr(totalSales / count) : '0.00',
    },
  }
}

/**
 * @param {string} businessProfileId
 * @param {{ from: Date | null, to: Date | null }} params
 */
export async function queryMenuItemsReport(businessProfileId, params) {
  const lines = await prisma.invoiceLine.findMany({
    where: {
      invoice: invoiceWhere(businessProfileId, params, { status: 'completed' }),
    },
    include: {
      menuItem: {
        select: {
          id: true,
          nameEn: true,
          nameAr: true,
          category: { select: { nameEn: true, nameAr: true } },
        },
      },
    },
  })

  /** @type {Map<string, { menuItemId: string | null, nameEn: string, nameAr: string, categoryName: string, qtySold: number, revenue: number }>} */
  const map = new Map()
  for (const line of lines) {
    const key = line.menuItemId ?? `snap:${line.nameAr}|${line.nameEn ?? ''}`
    const existing = map.get(key) ?? {
      menuItemId: line.menuItemId,
      nameEn: line.menuItem?.nameEn || line.nameEn || '',
      nameAr: line.menuItem?.nameAr || line.nameAr,
      categoryName:
        line.menuItem?.category?.nameEn ||
        line.menuItem?.category?.nameAr ||
        '',
      qtySold: 0,
      revenue: 0,
    }
    existing.qtySold += line.quantity
    existing.revenue += parseMoney(line.lineTotal)
    map.set(key, existing)
  }

  const rows = [...map.values()]
    .map((r) => ({
      menuItemId: r.menuItemId,
      nameEn: r.nameEn,
      nameAr: r.nameAr,
      categoryName: r.categoryName,
      qtySold: r.qtySold,
      revenue: toMoneyStr(r.revenue),
    }))
    .sort((a, b) => parseMoney(b.revenue) - parseMoney(a.revenue))

  const totalRevenue = rows.reduce((s, r) => s + parseMoney(r.revenue), 0)
  const totalQty = rows.reduce((s, r) => s + r.qtySold, 0)
  return {
    rows,
    totals: {
      itemCount: rows.length,
      totalQtySold: totalQty,
      totalRevenue: toMoneyStr(totalRevenue),
    },
  }
}

/**
 * @param {string} businessProfileId
 * @param {{ from: Date | null, to: Date | null }} params
 */
export async function queryCategoriesReport(businessProfileId, params) {
  const lines = await prisma.invoiceLine.findMany({
    where: {
      invoice: invoiceWhere(businessProfileId, params, { status: 'completed' }),
    },
    include: {
      menuItem: {
        select: {
          categoryId: true,
          category: { select: { id: true, nameEn: true, nameAr: true } },
        },
      },
    },
  })

  /** @type {Map<string, { categoryId: string | null, nameEn: string, nameAr: string, qtySold: number, revenue: number }>} */
  const map = new Map()
  for (const line of lines) {
    const cat = line.menuItem?.category
    const nameEn = (cat?.nameEn || '').trim()
    const nameAr = (cat?.nameAr || '').trim()
    const key = (nameEn || nameAr).toLocaleLowerCase('en') || 'uncategorized'
    const existing = map.get(key) ?? {
      categoryId: cat?.id ?? null,
      nameEn: nameEn || 'Uncategorized',
      nameAr: nameAr || 'بدون تصنيف',
      qtySold: 0,
      revenue: 0,
    }
    if (!existing.nameEn && nameEn) existing.nameEn = nameEn
    if (!existing.nameAr && nameAr) existing.nameAr = nameAr
    existing.qtySold += line.quantity
    existing.revenue += parseMoney(line.lineTotal)
    map.set(key, existing)
  }

  const rows = [...map.values()]
    .map((r) => ({
      categoryId: r.categoryId,
      nameEn: r.nameEn,
      nameAr: r.nameAr,
      qtySold: r.qtySold,
      revenue: toMoneyStr(r.revenue),
    }))
    .sort((a, b) => parseMoney(b.revenue) - parseMoney(a.revenue))

  return {
    rows,
    totals: {
      categoryCount: rows.length,
      totalRevenue: toMoneyStr(rows.reduce((s, r) => s + parseMoney(r.revenue), 0)),
      totalQtySold: rows.reduce((s, r) => s + r.qtySold, 0),
    },
  }
}

/**
 * @param {string} businessProfileId
 * @param {{ from: Date | null, to: Date | null }} params
 */
export async function queryTaxReport(businessProfileId, params) {
  const [invoiceLines, creditLines, debitLines] = await Promise.all([
    prisma.invoiceLine.findMany({
      where: {
        invoice: invoiceWhere(businessProfileId, params, { status: 'completed' }),
      },
      select: { vatPreset: true, vatAmount: true, lineTotal: true },
    }),
    prisma.creditNoteLine.findMany({
      where: {
        creditNote: {
          businessProfileId: prismaProfileId(businessProfileId),
          ...WHERE_NOT_DELETED,
          ...(params.from || params.to
            ? {
                noteDate: {
                  ...(params.from ? { gte: params.from } : {}),
                  ...(params.to ? { lte: params.to } : {}),
                },
              }
            : {}),
        },
      },
      select: { vatPreset: true, vatAmount: true },
    }),
    prisma.debitNoteLine.findMany({
      where: {
        debitNote: {
          businessProfileId: prismaProfileId(businessProfileId),
          ...WHERE_NOT_DELETED,
          ...(params.from || params.to
            ? {
                noteDate: {
                  ...(params.from ? { gte: params.from } : {}),
                  ...(params.to ? { lte: params.to } : {}),
                },
              }
            : {}),
        },
      },
      select: { vatPreset: true, vatAmount: true },
    }),
  ])

  /** @type {Map<string, { vatPreset: string, outputVat: number, creditVat: number, debitVat: number }>} */
  const map = new Map()
  function ensure(preset) {
    const key = String(preset)
    if (!map.has(key)) {
      map.set(key, { vatPreset: key, outputVat: 0, creditVat: 0, debitVat: 0 })
    }
    return map.get(key)
  }

  for (const line of invoiceLines) {
    const row = ensure(line.vatPreset)
    row.outputVat += parseMoney(line.vatAmount)
  }
  for (const line of creditLines) {
    const row = ensure(line.vatPreset)
    row.creditVat += parseMoney(line.vatAmount)
  }
  for (const line of debitLines) {
    const row = ensure(line.vatPreset)
    row.debitVat += parseMoney(line.vatAmount)
  }

  const rows = [...map.values()].map((r) => {
    const netOutput = r.outputVat - r.creditVat + r.debitVat
    return {
      vatPreset: r.vatPreset,
      outputVat: toMoneyStr(r.outputVat),
      creditNoteVat: toMoneyStr(r.creditVat),
      debitNoteVat: toMoneyStr(r.debitVat),
      netOutputVat: toMoneyStr(netOutput),
    }
  })

  const netOutputVat = rows.reduce((s, r) => s + parseMoney(r.netOutputVat), 0)
  return {
    rows,
    totals: {
      outputVat: toMoneyStr(rows.reduce((s, r) => s + parseMoney(r.outputVat), 0)),
      creditNoteVat: toMoneyStr(rows.reduce((s, r) => s + parseMoney(r.creditNoteVat), 0)),
      debitNoteVat: toMoneyStr(rows.reduce((s, r) => s + parseMoney(r.debitNoteVat), 0)),
      netOutputVat: toMoneyStr(netOutputVat),
    },
  }
}

/**
 * @param {string} businessProfileId
 * @param {{ from: Date, to: Date }} params
 */
export async function queryDailyReport(businessProfileId, params) {
  const invoices = await prisma.invoice.findMany({
    where: invoiceWhere(businessProfileId, params),
    orderBy: [{ invoiceDate: 'asc' }],
    include: { createdByStaff: { select: { name: true } } },
  })

  let cash = 0
  let card = 0
  let completed = 0
  let voided = 0
  let sales = 0
  const rows = invoices.map((inv) => {
    if (inv.status === 'completed') {
      completed += 1
      sales += parseMoney(inv.grandTotal)
      if (inv.paymentMethod === 'cash') cash += parseMoney(inv.grandTotal)
      else card += parseMoney(inv.grandTotal)
    } else {
      voided += 1
    }
    return {
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      invoiceDate: inv.invoiceDate.toISOString(),
      cashierName: inv.createdByStaff?.name ?? '',
      paymentMethod: inv.paymentMethod,
      grandTotal: inv.grandTotal,
      status: inv.status,
      zatcaStatus: inv.zatcaStatus ?? '',
    }
  })

  return {
    rows,
    totals: {
      invoiceCount: invoices.length,
      completedCount: completed,
      voidedCount: voided,
      totalSales: toMoneyStr(sales),
      cashTotal: toMoneyStr(cash),
      cardTotal: toMoneyStr(card),
    },
  }
}

/**
 * @param {string} businessProfileId
 * @param {{ from: Date | null, to: Date | null }} params
 */
export async function queryDateRangeSummary(businessProfileId, params) {
  const [completed, voided, creditNotes, debitNotes] = await Promise.all([
    prisma.invoice.findMany({
      where: invoiceWhere(businessProfileId, params, { status: 'completed' }),
      select: { subtotal: true, totalVat: true, grandTotal: true, paymentMethod: true },
    }),
    prisma.invoice.count({
      where: invoiceWhere(businessProfileId, params, { status: 'voided' }),
    }),
    prisma.creditNote.findMany({
      where: {
        businessProfileId: prismaProfileId(businessProfileId),
        ...WHERE_NOT_DELETED,
        ...(params.from || params.to
          ? {
              noteDate: {
                ...(params.from ? { gte: params.from } : {}),
                ...(params.to ? { lte: params.to } : {}),
              },
            }
          : {}),
      },
      select: { grandTotal: true },
    }),
    prisma.debitNote.findMany({
      where: {
        businessProfileId: prismaProfileId(businessProfileId),
        ...WHERE_NOT_DELETED,
        ...(params.from || params.to
          ? {
              noteDate: {
                ...(params.from ? { gte: params.from } : {}),
                ...(params.to ? { lte: params.to } : {}),
              },
            }
          : {}),
      },
      select: { grandTotal: true },
    }),
  ])

  let totalSales = 0
  let totalVat = 0
  let grandTotal = 0
  let cashTotal = 0
  let cardTotal = 0
  for (const inv of completed) {
    totalSales += parseMoney(inv.subtotal)
    totalVat += parseMoney(inv.totalVat)
    grandTotal += parseMoney(inv.grandTotal)
    if (inv.paymentMethod === 'cash') cashTotal += parseMoney(inv.grandTotal)
    else cardTotal += parseMoney(inv.grandTotal)
  }

  const creditTotal = creditNotes.reduce((s, n) => s + parseMoney(n.grandTotal), 0)
  const debitTotal = debitNotes.reduce((s, n) => s + parseMoney(n.grandTotal), 0)

  return {
    rows: [],
    totals: {
      totalSales: toMoneyStr(totalSales),
      totalVat: toMoneyStr(totalVat),
      grandTotal: toMoneyStr(grandTotal),
      cashTotal: toMoneyStr(cashTotal),
      cardTotal: toMoneyStr(cardTotal),
      invoiceCount: completed.length,
      voidedCount: voided,
      creditNoteTotal: toMoneyStr(creditTotal),
      debitNoteTotal: toMoneyStr(debitTotal),
      creditNoteCount: creditNotes.length,
      debitNoteCount: debitNotes.length,
    },
  }
}

/**
 * @param {string} businessProfileId
 * @param {{ periodA: { from: Date, to: Date }, periodB: { from: Date, to: Date } }} params
 */
export async function queryComparisonReport(businessProfileId, params) {
  const [a, b] = await Promise.all([
    queryDateRangeSummary(businessProfileId, params.periodA),
    queryDateRangeSummary(businessProfileId, params.periodB),
  ])

  const metrics = [
    'totalSales',
    'totalVat',
    'grandTotal',
    'cashTotal',
    'cardTotal',
    'invoiceCount',
    'voidedCount',
    'creditNoteTotal',
    'debitNoteTotal',
  ]

  const rows = metrics.map((metric) => {
    const periodA = a.totals[metric]
    const periodB = b.totals[metric]
    const aNum = typeof periodA === 'number' ? periodA : parseMoney(periodA)
    const bNum = typeof periodB === 'number' ? periodB : parseMoney(periodB)
    const change = percentChange(aNum, bNum)
    return {
      metric,
      periodA: String(periodA),
      periodB: String(periodB),
      ...change,
    }
  })

  return { rows, totals: {} }
}

/**
 * @param {string} businessProfileId
 * @param {{ from: Date | null, to: Date | null }} params
 */
export async function queryCashiersReport(businessProfileId, params) {
  const invoices = await prisma.invoice.findMany({
    where: invoiceWhere(businessProfileId, params, { status: 'completed' }),
    select: {
      createdByStaffId: true,
      subtotal: true,
      grandTotal: true,
      createdByStaff: { select: { name: true, email: true } },
    },
  })

  /** @type {Map<string, { cashierId: string, cashierName: string, invoiceCount: number, totalSales: number, grandTotal: number }>} */
  const map = new Map()
  for (const inv of invoices) {
    const email = (inv.createdByStaff?.email ?? '').trim().toLowerCase()
    const key = email || inv.createdByStaffId
    const existing = map.get(key) ?? {
      cashierId: key,
      cashierName: inv.createdByStaff?.name ?? '',
      invoiceCount: 0,
      totalSales: 0,
      grandTotal: 0,
    }
    if (!existing.cashierName && inv.createdByStaff?.name) {
      existing.cashierName = inv.createdByStaff.name
    }
    existing.invoiceCount += 1
    existing.totalSales += parseMoney(inv.subtotal)
    existing.grandTotal += parseMoney(inv.grandTotal)
    map.set(key, existing)
  }

  const rows = [...map.values()]
    .map((r) => ({
      cashierId: r.cashierId,
      cashierName: r.cashierName,
      invoiceCount: r.invoiceCount,
      totalSales: toMoneyStr(r.totalSales),
      grandTotal: toMoneyStr(r.grandTotal),
      averageInvoiceValue: r.invoiceCount > 0 ? toMoneyStr(r.totalSales / r.invoiceCount) : '0.00',
    }))
    .sort((a, b) => parseMoney(b.grandTotal) - parseMoney(a.grandTotal))

  return {
    rows,
    totals: {
      cashierCount: rows.length,
      invoiceCount: rows.reduce((s, r) => s + r.invoiceCount, 0),
      totalSales: toMoneyStr(rows.reduce((s, r) => s + parseMoney(r.totalSales), 0)),
    },
  }
}

/**
 * @param {string} businessProfileId
 * @param {{ from: Date | null, to: Date | null }} params
 */
export async function queryPaymentsReport(businessProfileId, params) {
  const invoices = await prisma.invoice.findMany({
    where: invoiceWhere(businessProfileId, params, { status: 'completed' }),
    orderBy: [{ invoiceDate: 'desc' }],
    include: { createdByStaff: { select: { name: true } } },
  })

  let cashTotal = 0
  let cardTotal = 0
  const rows = invoices.map((inv) => {
    const amount = parseMoney(inv.grandTotal)
    if (inv.paymentMethod === 'cash') cashTotal += amount
    else cardTotal += amount
    return {
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      invoiceDate: inv.invoiceDate.toISOString(),
      cashierName: inv.createdByStaff?.name ?? '',
      paymentMethod: inv.paymentMethod,
      amount: inv.grandTotal,
      amountTendered: inv.amountTendered ?? '',
      changeGiven: inv.changeGiven ?? '',
    }
  })

  return {
    rows,
    totals: {
      paymentCount: rows.length,
      cashTotal: toMoneyStr(cashTotal),
      cardTotal: toMoneyStr(cardTotal),
      grandTotal: toMoneyStr(cashTotal + cardTotal),
    },
  }
}

/**
 * @param {string} businessProfileId
 * @param {{ from: Date | null, to: Date | null }} params
 */
export async function queryZatcaStatusReport(businessProfileId, params) {
  const invoices = await prisma.invoice.findMany({
    where: invoiceWhere(businessProfileId, params, { status: 'completed' }),
    orderBy: [{ invoiceDate: 'desc' }],
    select: {
      id: true,
      invoiceNumber: true,
      invoiceDate: true,
      grandTotal: true,
      zatcaStatus: true,
      zatcaLastError: true,
      zatcaReportAttempts: true,
      zatcaClearedAt: true,
    },
  })

  const counts = { pending: 0, reported: 0, cleared: 0, failed: 0, none: 0 }
  const rows = invoices.map((inv) => {
    const status = inv.zatcaStatus ?? 'none'
    if (status in counts) counts[status] += 1
    else counts.none += 1
    return {
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      invoiceDate: inv.invoiceDate.toISOString(),
      grandTotal: inv.grandTotal,
      zatcaStatus: status,
      zatcaLastError: inv.zatcaLastError ?? '',
      zatcaReportAttempts: inv.zatcaReportAttempts,
      zatcaClearedAt: inv.zatcaClearedAt?.toISOString() ?? '',
    }
  })

  return {
    rows,
    totals: {
      invoiceCount: rows.length,
      pendingCount: counts.pending,
      reportedCount: counts.reported,
      clearedCount: counts.cleared,
      failedCount: counts.failed,
      noneCount: counts.none,
    },
  }
}

/**
 * @param {string} businessProfileId
 * @param {{ from: Date | null, to: Date | null }} params
 */
export async function queryCreditDebitNotesReport(businessProfileId, params) {
  const dateFilter =
    params.from || params.to
      ? {
          noteDate: {
            ...(params.from ? { gte: params.from } : {}),
            ...(params.to ? { lte: params.to } : {}),
          },
        }
      : {}

  const [credits, debits] = await Promise.all([
    prisma.creditNote.findMany({
      where: {
        businessProfileId: prismaProfileId(businessProfileId),
        ...WHERE_NOT_DELETED,
        ...dateFilter,
      },
      orderBy: [{ noteDate: 'desc' }],
      include: {
        invoice: { select: { invoiceNumber: true } },
        createdByStaff: { select: { name: true } },
      },
    }),
    prisma.debitNote.findMany({
      where: {
        businessProfileId: prismaProfileId(businessProfileId),
        ...WHERE_NOT_DELETED,
        ...dateFilter,
      },
      orderBy: [{ noteDate: 'desc' }],
      include: {
        invoice: { select: { invoiceNumber: true } },
        createdByStaff: { select: { name: true } },
      },
    }),
  ])

  const creditRows = credits.map((n) => ({
    id: n.id,
    noteType: 'credit',
    noteNumber: n.creditNoteNumber,
    noteDate: n.noteDate.toISOString(),
    invoiceNumber: n.invoice?.invoiceNumber ?? n.invoiceNumberSnapshot ?? '',
    cashierName: n.createdByStaff?.name ?? '',
    grandTotal: n.grandTotal,
    totalVat: n.totalVat,
    zatcaStatus: n.zatcaStatus ?? '',
  }))
  const debitRows = debits.map((n) => ({
    id: n.id,
    noteType: 'debit',
    noteNumber: n.debitNoteNumber,
    noteDate: n.noteDate.toISOString(),
    invoiceNumber: n.invoice?.invoiceNumber ?? n.invoiceNumberSnapshot ?? '',
    cashierName: n.createdByStaff?.name ?? '',
    grandTotal: n.grandTotal,
    totalVat: n.totalVat,
    zatcaStatus: n.zatcaStatus ?? '',
  }))

  const rows = [...creditRows, ...debitRows].sort(
    (a, b) => new Date(b.noteDate).getTime() - new Date(a.noteDate).getTime(),
  )

  return {
    rows,
    totals: {
      creditCount: credits.length,
      debitCount: debits.length,
      creditTotal: toMoneyStr(credits.reduce((s, n) => s + parseMoney(n.grandTotal), 0)),
      debitTotal: toMoneyStr(debits.reduce((s, n) => s + parseMoney(n.grandTotal), 0)),
    },
  }
}

/**
 * @param {string} businessProfileId
 * @param {{ from: Date | null, to: Date | null }} params
 */
export async function queryVoidsReport(businessProfileId, params) {
  const invoices = await prisma.invoice.findMany({
    where: invoiceWhere(businessProfileId, params, { status: 'voided' }),
    orderBy: [{ invoiceDate: 'desc' }],
    include: { createdByStaff: { select: { name: true } } },
  })

  const rows = invoices.map((inv) => ({
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    invoiceDate: inv.invoiceDate.toISOString(),
    cashierName: inv.createdByStaff?.name ?? '',
    paymentMethod: inv.paymentMethod,
    subtotal: inv.subtotal,
    totalVat: inv.totalVat,
    grandTotal: inv.grandTotal,
  }))

  return {
    rows,
    totals: {
      voidedCount: rows.length,
      voidedTotal: toMoneyStr(rows.reduce((s, r) => s + parseMoney(r.grandTotal), 0)),
    },
  }
}

/**
 * @param {string} businessProfileId
 * @param {{ from: Date | null, to: Date | null }} params
 */
export async function queryDiscountsReport(businessProfileId, params) {
  const lines = await prisma.invoiceLine.findMany({
    where: {
      invoice: invoiceWhere(businessProfileId, params, { status: 'completed' }),
      NOT: { discount: '0' },
    },
    include: {
      invoice: {
        select: {
          invoiceNumber: true,
          invoiceDate: true,
          createdByStaff: { select: { name: true } },
        },
      },
    },
  })

  const rows = lines
    .filter((l) => parseMoney(l.discount) > 0)
    .map((line) => ({
      id: line.id,
      invoiceNumber: line.invoice.invoiceNumber,
      invoiceDate: line.invoice.invoiceDate.toISOString(),
      cashierName: line.invoice.createdByStaff?.name ?? '',
      itemName: line.nameEn || line.nameAr,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      discount: line.discount,
      lineTotal: line.lineTotal,
    }))

  return {
    rows,
    totals: {
      discountLineCount: rows.length,
      totalDiscount: toMoneyStr(rows.reduce((s, r) => s + parseMoney(r.discount), 0)),
    },
  }
}

/**
 * @param {string} businessProfileId
 * @param {{ from: Date | null, to: Date | null }} params
 */
export async function querySalarySlipsReport(businessProfileId, params) {
  const slips = await prisma.salarySlip.findMany({
    where: {
      businessProfileId: prismaProfileId(businessProfileId),
      ...WHERE_NOT_DELETED,
      ...(params.from || params.to
        ? {
            slipDate: {
              ...(params.from ? { gte: params.from } : {}),
              ...(params.to ? { lte: params.to } : {}),
            },
          }
        : {}),
    },
    orderBy: [{ slipDate: 'desc' }],
    include: { employee: { select: { name: true } } },
  })

  const rows = slips.map((s) => ({
    id: s.id,
    voucherNumber: s.voucherNumber,
    slipDate: s.slipDate.toISOString(),
    employeeName: s.employee?.name ?? '',
    basicPay: s.basicPay,
    totalEarnings: s.totalEarnings,
    totalDeductions: s.totalDeductions,
    netTotal: s.netTotal,
  }))

  return {
    rows,
    totals: {
      slipCount: rows.length,
      totalNet: toMoneyStr(rows.reduce((s, r) => s + parseMoney(r.netTotal), 0)),
      totalEarnings: toMoneyStr(rows.reduce((s, r) => s + parseMoney(r.totalEarnings), 0)),
      totalDeductions: toMoneyStr(rows.reduce((s, r) => s + parseMoney(r.totalDeductions), 0)),
    },
  }
}

/**
 * @param {string} businessProfileId
 * @param {{ from: Date | null, to: Date | null }} params
 */
export async function queryEmployeePaymentsReport(businessProfileId, params) {
  const payments = await prisma.employeePayment.findMany({
    where: {
      businessProfileId: prismaProfileId(businessProfileId),
      ...WHERE_NOT_DELETED,
      ...(params.from || params.to
        ? {
            paymentDate: {
              ...(params.from ? { gte: params.from } : {}),
              ...(params.to ? { lte: params.to } : {}),
            },
          }
        : {}),
    },
    orderBy: [{ paymentDate: 'desc' }],
    include: { employee: { select: { name: true } } },
  })

  const rows = payments.map((p) => ({
    id: p.id,
    paymentDate: p.paymentDate.toISOString(),
    employeeName: p.employee?.name ?? '',
    paymentType: p.paymentType,
    payPeriod: p.payPeriod ?? '',
    amount: p.amount,
    paymentMethod: p.paymentMethod,
    remarks: p.remarks ?? '',
  }))

  const byType = { salary: 0, advance: 0, bonus: 0 }
  for (const r of rows) {
    byType[r.paymentType] = (byType[r.paymentType] ?? 0) + parseMoney(r.amount)
  }

  return {
    rows,
    totals: {
      paymentCount: rows.length,
      totalAmount: toMoneyStr(rows.reduce((s, r) => s + parseMoney(r.amount), 0)),
      salaryTotal: toMoneyStr(byType.salary),
      advanceTotal: toMoneyStr(byType.advance),
      bonusTotal: toMoneyStr(byType.bonus),
    },
  }
}

/**
 * @param {string} businessProfileId
 */
export async function queryAdvancesReport(businessProfileId) {
  const ids = (Array.isArray(businessProfileId)
    ? businessProfileId
    : [businessProfileId]
  ).filter(Boolean)
  const profiles = await prisma.businessProfile.findMany({
    where: { id: { in: ids.length ? ids : [''] } },
    select: { ownerUserId: true },
  })
  const ownerUserId = profiles[0]?.ownerUserId ?? ''

  const employees = await prisma.employee.findMany({
    where: {
      businessProfileId: prismaProfileId(ids),
      ...WHERE_NOT_DELETED,
      ...employeeExcludeOwnerWhere({ ownerUserId }),
    },
    select: {
      id: true,
      name: true,
      salarySlips: {
        where: WHERE_NOT_DELETED,
        select: {
          netTotal: true,
          lines: {
            where: {
              categoryType: 'deduction',
              payslipCategory: { name: { equals: 'Advance', mode: 'insensitive' } },
            },
            select: { total: true },
          },
        },
      },
      payments: {
        where: WHERE_NOT_DELETED,
        select: { amount: true, paymentType: true },
      },
    },
  })

  const rows = []
  for (const emp of employees) {
    const advanceDeductionLines = emp.salarySlips.flatMap((s) => s.lines)
    const balance = computeEmployeeBalance({
      salarySlips: emp.salarySlips,
      payments: emp.payments.filter((p) => p.paymentType === 'salary' || p.paymentType === 'advance'),
      advanceDeductionLines,
    })
    if (parseMoney(balance.outstandingAdvance) <= 0 && parseMoney(balance.totalAdvanceGiven) <= 0) {
      continue
    }
    rows.push({
      employeeId: emp.id,
      employeeName: emp.name,
      totalAdvanceGiven: balance.totalAdvanceGiven,
      totalAdvanceDeducted: balance.totalAdvanceDeducted,
      outstandingAdvance: balance.outstandingAdvance,
    })
  }

  rows.sort((a, b) => parseMoney(b.outstandingAdvance) - parseMoney(a.outstandingAdvance))

  return {
    rows,
    totals: {
      employeeCount: rows.length,
      totalAdvanceGiven: toMoneyStr(rows.reduce((s, r) => s + parseMoney(r.totalAdvanceGiven), 0)),
      totalAdvanceDeducted: toMoneyStr(
        rows.reduce((s, r) => s + parseMoney(r.totalAdvanceDeducted), 0),
      ),
      outstandingAdvance: toMoneyStr(
        rows.reduce((s, r) => s + parseMoney(r.outstandingAdvance), 0),
      ),
    },
  }
}
