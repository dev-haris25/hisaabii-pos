import { prismaProfileId } from '@/lib/auth/owned-restaurant-scope'
import { WHERE_NOT_DELETED } from '@/lib/db/soft-delete-scope'
import { computeEmployeeBalance } from '@/lib/hr/compute-employee-balance'
import { VISA_EXPIRY_WINDOW_DAYS } from '@/lib/hr/visa-expiry-status'
import { prisma } from '@/lib/prisma'
import { hasFullAccess } from '@/lib/rbac/ability-utils'
import { employeeExcludeOwnerWhere } from '@/lib/rbac/owner-admin-gates'
import { parseMoney, toMoneyStr } from '@/lib/reports/money'

function startOfDay(d = new Date()) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

function endOfDay(d = new Date()) {
  const x = new Date(d)
  x.setHours(23, 59, 59, 999)
  return x
}

function addDays(d, n) {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

function dayKey(d) {
  return d.toISOString().slice(0, 10)
}

/** Minimum completed invoices in the window before peak-hours heatmap is useful. */
const PEAK_HOURS_MIN_ORDERS = 15

/**
 * @param {Date} d
 */
function localHour(d) {
  return d.getHours()
}

/**
 * @param {import('@casl/ability').MongoAbility} ability
 */
export function resolveDashboardVariant(ability) {
  if (hasFullAccess(ability)) return 'full'
  if (ability.can('read', 'Dashboard') && ability.can('read', 'Pos')) return 'full'
  if (ability.can('read', 'Invoice')) return 'accountant'
  if (ability.can('read', 'Employee') || ability.can('read', 'VisaStatus')) return 'hr'
  return 'full'
}

/**
 * @param {string | string[]} businessProfileId
 * @param {import('@casl/ability').MongoAbility} ability
 * @param {{ restaurantName?: string | null }} [meta]
 */
export async function queryPosDashboard(businessProfileId, ability, meta = {}) {
  const profileIds = (Array.isArray(businessProfileId)
    ? businessProfileId
    : [businessProfileId]
  ).filter(Boolean)
  businessProfileId = prismaProfileId(profileIds)
  const variant = resolveDashboardVariant(ability)
  const todayStart = startOfDay()
  const todayEnd = endOfDay()
  const yesterdayStart = startOfDay(addDays(todayStart, -1))
  const yesterdayEnd = endOfDay(addDays(todayStart, -1))
  const trendStart = startOfDay(addDays(todayStart, -6))

  const canSales =
    hasFullAccess(ability) ||
    ability.can('read', 'Invoice') ||
    ability.can('read', 'Pos')
  const canHr =
    hasFullAccess(ability) ||
    ability.can('read', 'Employee') ||
    ability.can('read', 'VisaStatus') ||
    ability.can('read', 'SalarySlip') ||
    ability.can('read', 'EmployeePayment') ||
    ability.can('read', 'ReportAdvances')

  /** @type {Record<string, unknown>} */
  const payload = {
    variant,
    restaurantName: meta.restaurantName ?? null,
    generatedAt: new Date().toISOString(),
    alerts: {
      zatcaFailed: 0,
      zatcaPending: 0,
      visaExpiring: 0,
      outstandingAdvance: '0.00',
      employeesWithAdvance: 0,
    },
  }

  if (canSales) {
    const sameWeekdayStart = startOfDay(addDays(todayStart, -7))
    const sameWeekdayEnd = endOfDay(addDays(todayStart, -7))

    const [
      todayInvoices,
      yesterdayInvoices,
      sameWeekdayInvoices,
      trendInvoices,
      recentInvoices,
      zatcaFailed,
      zatcaPending,
      voidedTodayCount,
      topLines,
      categoryLines,
      discountLines,
      cashierInvoices,
      weekCreditNotes,
      weekDebitNotes,
    ] = await Promise.all([
      prisma.invoice.findMany({
        where: {
          businessProfileId,
          ...WHERE_NOT_DELETED,
          status: 'completed',
          invoiceDate: { gte: todayStart, lte: todayEnd },
        },
        select: {
          grandTotal: true,
          totalVat: true,
          paymentMethod: true,
          createdByStaffId: true,
        },
      }),
      prisma.invoice.findMany({
        where: {
          businessProfileId,
          ...WHERE_NOT_DELETED,
          status: 'completed',
          invoiceDate: { gte: yesterdayStart, lte: yesterdayEnd },
        },
        select: { grandTotal: true },
      }),
      prisma.invoice.findMany({
        where: {
          businessProfileId,
          ...WHERE_NOT_DELETED,
          status: 'completed',
          invoiceDate: { gte: sameWeekdayStart, lte: sameWeekdayEnd },
        },
        select: { grandTotal: true },
      }),
      prisma.invoice.findMany({
        where: {
          businessProfileId,
          ...WHERE_NOT_DELETED,
          status: 'completed',
          invoiceDate: { gte: trendStart, lte: todayEnd },
        },
        select: { invoiceDate: true, grandTotal: true },
      }),
      prisma.invoice.findMany({
        where: {
          businessProfileId,
          ...WHERE_NOT_DELETED,
          status: 'completed',
        },
        orderBy: [{ invoiceDate: 'desc' }],
        take: 10,
        include: {
          createdByStaff: { select: { name: true } },
        },
      }),
      prisma.invoice.count({
        where: {
          businessProfileId,
          ...WHERE_NOT_DELETED,
          status: 'completed',
          zatcaStatus: 'failed',
        },
      }),
      prisma.invoice.count({
        where: {
          businessProfileId,
          ...WHERE_NOT_DELETED,
          status: 'completed',
          zatcaStatus: 'pending',
        },
      }),
      prisma.invoice.count({
        where: {
          businessProfileId,
          ...WHERE_NOT_DELETED,
          status: 'voided',
          invoiceDate: { gte: todayStart, lte: todayEnd },
        },
      }),
      prisma.invoiceLine.findMany({
        where: {
          invoice: {
            businessProfileId,
            ...WHERE_NOT_DELETED,
            status: 'completed',
            invoiceDate: { gte: todayStart, lte: todayEnd },
          },
        },
        select: {
          menuItemId: true,
          nameAr: true,
          nameEn: true,
          quantity: true,
          lineTotal: true,
          menuItem: { select: { id: true, imageUrl: true, updatedAt: true } },
        },
      }),
      prisma.invoiceLine.findMany({
        where: {
          invoice: {
            businessProfileId,
            ...WHERE_NOT_DELETED,
            status: 'completed',
            invoiceDate: { gte: todayStart, lte: todayEnd },
          },
        },
        select: {
          quantity: true,
          lineTotal: true,
          menuItem: {
            select: {
              category: { select: { id: true, nameEn: true, nameAr: true } },
            },
          },
        },
      }),
      prisma.invoiceLine.findMany({
        where: {
          invoice: {
            businessProfileId,
            ...WHERE_NOT_DELETED,
            status: 'completed',
            invoiceDate: { gte: todayStart, lte: todayEnd },
          },
          NOT: { discount: '0' },
        },
        select: { discount: true },
      }),
      prisma.invoice.findMany({
        where: {
          businessProfileId,
          ...WHERE_NOT_DELETED,
          status: 'completed',
          invoiceDate: { gte: todayStart, lte: todayEnd },
        },
        select: {
          createdByStaffId: true,
          grandTotal: true,
          createdByStaff: { select: { name: true, email: true } },
        },
      }),
      prisma.creditNote.findMany({
        where: {
          businessProfileId,
          ...WHERE_NOT_DELETED,
          noteDate: { gte: trendStart, lte: todayEnd },
        },
        select: { grandTotal: true },
      }),
      prisma.debitNote.findMany({
        where: {
          businessProfileId,
          ...WHERE_NOT_DELETED,
          noteDate: { gte: trendStart, lte: todayEnd },
        },
        select: { grandTotal: true },
      }),
    ])

    let salesToday = 0
    let vatToday = 0
    let cashToday = 0
    let cardToday = 0
    for (const inv of todayInvoices) {
      const g = parseMoney(inv.grandTotal)
      salesToday += g
      vatToday += parseMoney(inv.totalVat)
      if (inv.paymentMethod === 'cash') cashToday += g
      else cardToday += g
    }
    const ordersToday = todayInvoices.length
    const salesYesterday = yesterdayInvoices.reduce(
      (s, inv) => s + parseMoney(inv.grandTotal),
      0,
    )
    const salesChangePct =
      salesYesterday === 0
        ? salesToday > 0
          ? 100
          : 0
        : ((salesToday - salesYesterday) / salesYesterday) * 100

    const salesSameWeekday = sameWeekdayInvoices.reduce(
      (s, inv) => s + parseMoney(inv.grandTotal),
      0,
    )
    const sameWeekdayChangePct =
      salesSameWeekday === 0
        ? salesToday > 0
          ? 100
          : 0
        : ((salesToday - salesSameWeekday) / salesSameWeekday) * 100

    const discountToday = discountLines.reduce((s, line) => s + parseMoney(line.discount), 0)
    const attemptsToday = ordersToday + voidedTodayCount
    const voidRateToday =
      attemptsToday === 0 ? 0 : Number(((voidedTodayCount / attemptsToday) * 100).toFixed(1))

    const creditNotesWeekCount = weekCreditNotes.length
    const debitNotesWeekCount = weekDebitNotes.length
    const creditNotesWeekTotal = weekCreditNotes.reduce(
      (s, n) => s + parseMoney(n.grandTotal),
      0,
    )
    const debitNotesWeekTotal = weekDebitNotes.reduce(
      (s, n) => s + parseMoney(n.grandTotal),
      0,
    )

    /** @type {number[]} */
    const hourCounts = Array.from({ length: 24 }, () => 0)
    for (const inv of trendInvoices) {
      const h = localHour(inv.invoiceDate)
      hourCounts[h] = (hourCounts[h] ?? 0) + 1
    }
    const peakOrdersTotal = trendInvoices.length
    const peakHours =
      peakOrdersTotal < PEAK_HOURS_MIN_ORDERS
        ? { insufficientVolume: true, minOrders: PEAK_HOURS_MIN_ORDERS, hours: [] }
        : {
            insufficientVolume: false,
            minOrders: PEAK_HOURS_MIN_ORDERS,
            hours: hourCounts.map((orders, hour) => ({ hour, orders })),
          }

    /** @type {Map<string, number>} */
    const byDay = new Map()
    for (let i = 0; i < 7; i += 1) {
      byDay.set(dayKey(addDays(trendStart, i)), 0)
    }
    for (const inv of trendInvoices) {
      const key = dayKey(inv.invoiceDate)
      if (byDay.has(key)) {
        byDay.set(key, (byDay.get(key) ?? 0) + parseMoney(inv.grandTotal))
      }
    }
    const salesTrend = [...byDay.entries()].map(([date, total]) => ({
      date,
      total: toMoneyStr(total),
    }))

    /** @type {Map<string, { nameAr: string, nameEn: string, imageUrl: string | null, qty: number, revenue: number }>} */
    const itemMap = new Map()
    for (const line of topLines) {
      const nameEn = (line.menuItem?.nameEn || line.nameEn || '').trim()
      const nameAr = (line.menuItem?.nameAr || line.nameAr || '').trim()
      const key = (nameEn || nameAr).toLocaleLowerCase('en')
      if (!key) continue
      const hasImage = Boolean(line.menuItem?.imageUrl && line.menuItem?.id)
      const imageUrl = hasImage
        ? `/api/auth/menu/items/${line.menuItem.id}/image?t=${encodeURIComponent(line.menuItem.updatedAt.toISOString())}`
        : null
      const row = itemMap.get(key) ?? {
        nameAr,
        nameEn,
        imageUrl,
        qty: 0,
        revenue: 0,
      }
      if (!row.imageUrl && imageUrl) row.imageUrl = imageUrl
      if (!row.nameEn && nameEn) row.nameEn = nameEn
      if (!row.nameAr && nameAr) row.nameAr = nameAr
      row.qty += line.quantity
      row.revenue += parseMoney(line.lineTotal)
      itemMap.set(key, row)
    }
    const topSellers = [...itemMap.values()]
      .sort((a, b) => b.qty - a.qty || b.revenue - a.revenue)
      .slice(0, 8)
      .map((r) => ({
        nameAr: r.nameAr,
        nameEn: r.nameEn,
        imageUrl: r.imageUrl,
        qtySold: r.qty,
        revenue: toMoneyStr(r.revenue),
      }))

    /** @type {Map<string, { nameAr: string, nameEn: string, revenue: number, qty: number }>} */
    const catMap = new Map()
    for (const line of categoryLines) {
      const cat = line.menuItem?.category
      const nameEn = (cat?.nameEn || '').trim()
      const nameAr = (cat?.nameAr || '').trim()
      const key = (nameEn || nameAr).toLocaleLowerCase('en') || 'uncategorized'
      const row = catMap.get(key) ?? {
        nameAr: nameAr || 'بدون تصنيف',
        nameEn: nameEn || 'Uncategorized',
        revenue: 0,
        qty: 0,
      }
      if (!row.nameEn && nameEn) row.nameEn = nameEn
      if (!row.nameAr && nameAr) row.nameAr = nameAr
      row.revenue += parseMoney(line.lineTotal)
      row.qty += line.quantity
      catMap.set(key, row)
    }
    const categoryMix = [...catMap.values()]
      .sort((a, b) => b.revenue - a.revenue)
      .map((r) => ({
        nameAr: r.nameAr,
        nameEn: r.nameEn,
        revenue: toMoneyStr(r.revenue),
        qtySold: r.qty,
      }))

    /** @type {Map<string, { name: string, sales: number, orders: number }>} */
    const cashierMap = new Map()
    for (const inv of cashierInvoices) {
      const email = (inv.createdByStaff?.email ?? '').trim().toLowerCase()
      const key = email || inv.createdByStaffId
      const row = cashierMap.get(key) ?? {
        name: inv.createdByStaff?.name ?? '',
        sales: 0,
        orders: 0,
      }
      if (!row.name && inv.createdByStaff?.name) {
        row.name = inv.createdByStaff.name
      }
      row.sales += parseMoney(inv.grandTotal)
      row.orders += 1
      cashierMap.set(key, row)
    }
    const cashierRanking = [...cashierMap.entries()]
      .map(([id, r]) => ({
        cashierId: id,
        cashierName: r.name,
        sales: toMoneyStr(r.sales),
        orders: r.orders,
      }))
      .sort((a, b) => parseMoney(b.sales) - parseMoney(a.sales))
      .slice(0, 8)

    payload.stats = {
      salesToday: toMoneyStr(salesToday),
      ordersToday,
      averageTicket: ordersToday > 0 ? toMoneyStr(salesToday / ordersToday) : '0.00',
      cashToday: toMoneyStr(cashToday),
      cardToday: toMoneyStr(cardToday),
      vatToday: toMoneyStr(vatToday),
      salesYesterday: toMoneyStr(salesYesterday),
      salesChangePct: Number(salesChangePct.toFixed(1)),
      salesSameWeekday: toMoneyStr(salesSameWeekday),
      sameWeekdayChangePct: Number(sameWeekdayChangePct.toFixed(1)),
      voidedToday: voidedTodayCount,
      voidRateToday,
      discountToday: toMoneyStr(discountToday),
      creditNotesWeekCount,
      debitNotesWeekCount,
      creditNotesWeekTotal: toMoneyStr(creditNotesWeekTotal),
      debitNotesWeekTotal: toMoneyStr(debitNotesWeekTotal),
    }
    payload.salesTrend = salesTrend
    payload.peakHours = peakHours
    payload.topSellers = topSellers
    payload.categoryMix = categoryMix
    payload.cashierRanking = cashierRanking
    payload.recentSales = recentInvoices.map((inv) => ({
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      invoiceDate: inv.invoiceDate.toISOString(),
      cashierName: inv.createdByStaff?.name ?? '',
      paymentMethod: inv.paymentMethod,
      grandTotal: inv.grandTotal,
      zatcaStatus: inv.zatcaStatus ?? '',
    }))
    payload.alerts = {
      ...(payload.alerts && typeof payload.alerts === 'object' ? payload.alerts : {}),
      zatcaFailed,
      zatcaPending,
    }
  }

  if (canHr) {
    const profiles = await prisma.businessProfile.findMany({
      where: { id: { in: profileIds.length ? profileIds : [''] } },
      select: { ownerUserId: true },
    })
    const profile = profiles[0]
    const windowEnd = addDays(todayStart, VISA_EXPIRY_WINDOW_DAYS)
    const [visaExpiring, salarySlipCount, paymentSumRows, advanceEmployees] =
      await Promise.all([
        prisma.employee.count({
          where: {
            businessProfileId,
            ...WHERE_NOT_DELETED,
            ...employeeExcludeOwnerWhere(profile ?? { ownerUserId: '' }),
            visaExpiry: { not: null, lte: windowEnd },
          },
        }),
        prisma.salarySlip.count({
          where: {
            businessProfileId,
            ...WHERE_NOT_DELETED,
            slipDate: { gte: todayStart, lte: todayEnd },
          },
        }),
        prisma.employeePayment.findMany({
          where: {
            businessProfileId,
            ...WHERE_NOT_DELETED,
            paymentDate: { gte: todayStart, lte: todayEnd },
          },
          select: { amount: true, paymentType: true },
        }),
        prisma.employee.findMany({
          where: {
            businessProfileId,
            ...WHERE_NOT_DELETED,
            ...employeeExcludeOwnerWhere(profile ?? { ownerUserId: '' }),
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
                    payslipCategory: {
                      name: { equals: 'Advance', mode: 'insensitive' },
                    },
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
        }),
      ])

    let paymentsToday = 0
    let advancesPaidToday = 0
    for (const p of paymentSumRows) {
      const amt = parseMoney(p.amount)
      paymentsToday += amt
      if (p.paymentType === 'advance') advancesPaidToday += amt
    }

    let outstandingAdvance = 0
    let employeesWithAdvance = 0
    for (const emp of advanceEmployees) {
      const balance = computeEmployeeBalance({
        salarySlips: emp.salarySlips,
        payments: emp.payments.filter(
          (p) => p.paymentType === 'salary' || p.paymentType === 'advance',
        ),
        advanceDeductionLines: emp.salarySlips.flatMap((s) => s.lines),
      })
      const out = parseMoney(balance.outstandingAdvance)
      if (out > 0) {
        outstandingAdvance += out
        employeesWithAdvance += 1
      }
    }

    payload.hrStats = {
      visaExpiring,
      salarySlipsToday: salarySlipCount,
      employeePaymentsToday: toMoneyStr(paymentsToday),
      advancesPaidToday: toMoneyStr(advancesPaidToday),
      outstandingAdvance: toMoneyStr(outstandingAdvance),
      employeesWithAdvance,
    }
    payload.alerts = {
      ...(payload.alerts && typeof payload.alerts === 'object' ? payload.alerts : {}),
      visaExpiring,
      outstandingAdvance: toMoneyStr(outstandingAdvance),
      employeesWithAdvance,
    }
  }

  return payload
}
