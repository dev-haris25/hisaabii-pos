import { WHERE_NOT_DELETED } from '@/lib/db/soft-delete-scope'
import { computeEmployeeBalance } from '@/lib/hr/compute-employee-balance'
import { VISA_EXPIRY_WINDOW_DAYS } from '@/lib/hr/visa-expiry-status'
import { notifyPosAudience } from '@/lib/notifications/notify-owner-and-actor'
import { prisma } from '@/lib/prisma'
import { employeeExcludeOwnerWhere } from '@/lib/rbac/owner-admin-gates'
import { parseMoney, toMoneyStr } from '@/lib/reports/money'

/** B2C ZATCA window is 24h — warn at 23h so ~1 hour remains. */
export const ZATCA_DEADLINE_WARN_MS = 23 * 60 * 60 * 1000

/** @param {Date} d */
function dayKey(d) {
  return d.toISOString().slice(0, 10)
}

/** @type {Map<string, number>} */
const lastReminderRunByBusiness = new Map()

const REMINDER_COOLDOWN_MS = 15 * 60 * 1000

/**
 * Time-based in-app reminders for one restaurant (visa, ZATCA deadline, advances).
 * Safe to call from poll/cron; throttled per business.
 *
 * @param {string} businessProfileId
 * @param {{ force?: boolean }} [opts]
 */
export async function runPosNotificationReminders(businessProfileId, opts = {}) {
  const now = Date.now()
  if (!opts.force) {
    const last = lastReminderRunByBusiness.get(businessProfileId) ?? 0
    if (now - last < REMINDER_COOLDOWN_MS) return { skipped: true }
  }
  lastReminderRunByBusiness.set(businessProfileId, now)

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const windowEnd = new Date(today)
  windowEnd.setDate(windowEnd.getDate() + VISA_EXPIRY_WINDOW_DAYS)

  const deadlineBefore = new Date(Date.now() - ZATCA_DEADLINE_WARN_MS)

  const profile = await prisma.businessProfile.findUnique({
    where: { id: businessProfileId },
    select: { ownerUserId: true },
  })

  const [employees, invoices, notesCredit, notesDebit, advanceEmployees] =
    await Promise.all([
      prisma.employee.findMany({
        where: {
          businessProfileId,
          ...WHERE_NOT_DELETED,
          ...employeeExcludeOwnerWhere(profile ?? { ownerUserId: '' }),
          visaExpiry: { not: null, lte: windowEnd },
        },
        select: { id: true, name: true, visaExpiry: true },
      }),
      prisma.invoice.findMany({
        where: {
          businessProfileId,
          ...WHERE_NOT_DELETED,
          status: 'completed',
          zatcaStatus: { in: ['pending', 'failed'] },
          createdAt: { lte: deadlineBefore },
        },
        select: {
          id: true,
          invoiceNumber: true,
          zatcaStatus: true,
          createdAt: true,
        },
        take: 50,
      }),
      prisma.creditNote.findMany({
        where: {
          businessProfileId,
          ...WHERE_NOT_DELETED,
          zatcaStatus: { in: ['pending', 'failed'] },
          createdAt: { lte: deadlineBefore },
        },
        select: { id: true, creditNoteNumber: true, zatcaStatus: true },
        take: 50,
      }),
      prisma.debitNote.findMany({
        where: {
          businessProfileId,
          ...WHERE_NOT_DELETED,
          zatcaStatus: { in: ['pending', 'failed'] },
          createdAt: { lte: deadlineBefore },
        },
        select: { id: true, debitNoteNumber: true, zatcaStatus: true },
        take: 50,
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

  for (const emp of employees) {
    if (!emp.visaExpiry) continue
    const expiry = emp.visaExpiry
    const expired = expiry < today
    const expiryDate = dayKey(expiry)
    await notifyPosAudience({
      businessProfileId,
      audience: 'hr',
      type: expired ? 'visa_expired' : 'visa_expiring',
      kind: 'hr',
      vars: { name: emp.name, expiryDate },
      link: '/hr/visa-status',
      dedupeKey: `${expired ? 'visa-expired' : 'visa-expiry'}:${emp.id}:${expiryDate}`,
    })
  }

  for (const inv of invoices) {
    await notifyPosAudience({
      businessProfileId,
      audience: 'zatca',
      type: 'zatca_report_pending',
      kind: 'zatca',
      vars: {
        detail: `Invoice ${inv.invoiceNumber} is still ${inv.zatcaStatus}`,
      },
      link: `/invoices/${inv.id}`,
      dedupeKey: `zatca-deadline:invoice:${inv.id}`,
    })
  }

  for (const note of notesCredit) {
    await notifyPosAudience({
      businessProfileId,
      audience: 'zatca',
      type: 'zatca_report_pending',
      kind: 'zatca',
      vars: {
        detail: `Credit note ${note.creditNoteNumber} is still ${note.zatcaStatus}`,
      },
      link: `/invoices/credit-notes/${note.id}`,
      dedupeKey: `zatca-deadline:credit:${note.id}`,
    })
  }

  for (const note of notesDebit) {
    await notifyPosAudience({
      businessProfileId,
      audience: 'zatca',
      type: 'zatca_report_pending',
      kind: 'zatca',
      vars: {
        detail: `Debit note ${note.debitNoteNumber} is still ${note.zatcaStatus}`,
      },
      link: `/invoices/debit-notes/${note.id}`,
      dedupeKey: `zatca-deadline:debit:${note.id}`,
    })
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

  if (employeesWithAdvance > 0) {
    await notifyPosAudience({
      businessProfileId,
      audience: 'hr',
      type: 'advance_outstanding',
      kind: 'hr',
      vars: {
        detail: `${employeesWithAdvance} staff · SAR ${toMoneyStr(outstandingAdvance)} outstanding`,
      },
      link: '/reports/advances',
      dedupeKey: `advance-outstanding:${businessProfileId}:${dayKey(today)}`,
    })
  }

  return { skipped: false }
}
