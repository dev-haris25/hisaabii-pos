import { NextResponse } from 'next/server'

import { jsonError } from '@/lib/api/json-response'
import { handleRouteError } from '@/lib/api/route-error'
import { WHERE_NOT_DELETED } from '@/lib/db/soft-delete-scope'
import { csvEscape } from '@/lib/reports/export-csv'
import { authorizeBusinessRequest } from '@/lib/rbac/authorize-api-request'
import { hasFullAccess } from '@/lib/rbac/ability-utils'
import { prisma } from '@/lib/prisma'

const EXPORT_LIMIT = 5000

/**
 * @param {string[]} header
 * @param {Array<Array<string | number | null | undefined>>} rows
 */
function toCsv(header, rows) {
  const lines = [
    header.map(csvEscape).join(','),
    ...rows.map((row) => row.map(csvEscape).join(',')),
  ]
  return `${lines.join('\n')}\n`
}

/**
 * @param {string} filename
 * @param {string} csv
 */
function csvResponse(filename, csv) {
  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}

/** @param {import('next/server').NextRequest} request */
export async function GET(request) {
  try {
    const auth = await authorizeBusinessRequest(request)
    if (auth.error) return auth.error
    const { profile, ability } = auth
    const id = profile.id
    const entity = new URL(request.url).searchParams.get('entity') ?? ''

    const can = (subject) =>
      hasFullAccess(ability) || ability.can('read', subject)

    if (entity === 'menuItems') {
      if (!can('MenuItem')) return jsonError(403, 'FORBIDDEN', 'Not allowed')
      const rows = await prisma.menuItem.findMany({
        where: { businessProfileId: id },
        orderBy: [{ sortOrder: 'asc' }, { nameAr: 'asc' }],
        take: EXPORT_LIMIT,
        select: {
          nameAr: true,
          nameEn: true,
          price: true,
          vatPreset: true,
          active: true,
          category: { select: { nameAr: true, nameEn: true } },
        },
      })
      return csvResponse(
        'hisabi-pos-menu-items.csv',
        toCsv(
          ['Name AR', 'Name EN', 'Category', 'Price', 'VAT', 'Active'],
          rows.map((r) => [
            r.nameAr,
            r.nameEn,
            r.category?.nameEn || r.category?.nameAr || '',
            String(r.price),
            r.vatPreset,
            r.active ? 'yes' : 'no',
          ]),
        ),
      )
    }

    if (entity === 'menuCategories') {
      if (!can('MenuCategory')) return jsonError(403, 'FORBIDDEN', 'Not allowed')
      const rows = await prisma.menuCategory.findMany({
        where: { businessProfileId: id },
        orderBy: [{ sortOrder: 'asc' }, { nameAr: 'asc' }],
        take: EXPORT_LIMIT,
        select: { nameAr: true, nameEn: true, active: true },
      })
      return csvResponse(
        'hisabi-pos-menu-categories.csv',
        toCsv(
          ['Name AR', 'Name EN', 'Active'],
          rows.map((r) => [r.nameAr, r.nameEn, r.active ? 'yes' : 'no']),
        ),
      )
    }

    if (entity === 'invoices') {
      if (!can('Invoice')) return jsonError(403, 'FORBIDDEN', 'Not allowed')
      const rows = await prisma.invoice.findMany({
        where: { businessProfileId: id, ...WHERE_NOT_DELETED },
        orderBy: [{ invoiceDate: 'desc' }, { createdAt: 'desc' }],
        take: EXPORT_LIMIT,
        select: {
          invoiceNumber: true,
          invoiceDate: true,
          grandTotal: true,
          paymentMethod: true,
          zatcaStatus: true,
          status: true,
        },
      })
      return csvResponse(
        'hisabi-pos-invoices.csv',
        toCsv(
          ['Invoice #', 'Date', 'Total', 'Payment', 'ZATCA', 'Status'],
          rows.map((r) => [
            r.invoiceNumber,
            r.invoiceDate?.toISOString?.()?.slice(0, 10) ?? '',
            String(r.grandTotal),
            r.paymentMethod,
            r.zatcaStatus,
            r.status,
          ]),
        ),
      )
    }

    if (entity === 'creditNotes') {
      if (!can('CreditNote')) return jsonError(403, 'FORBIDDEN', 'Not allowed')
      const rows = await prisma.creditNote.findMany({
        where: { businessProfileId: id, ...WHERE_NOT_DELETED },
        orderBy: [{ noteDate: 'desc' }, { createdAt: 'desc' }],
        take: EXPORT_LIMIT,
        select: {
          creditNoteNumber: true,
          noteDate: true,
          grandTotal: true,
          zatcaStatus: true,
          invoiceNumberSnapshot: true,
        },
      })
      return csvResponse(
        'hisabi-pos-credit-notes.csv',
        toCsv(
          ['Credit note #', 'Date', 'Total', 'ZATCA', 'Invoice #'],
          rows.map((r) => [
            r.creditNoteNumber,
            r.noteDate?.toISOString?.()?.slice(0, 10) ?? '',
            String(r.grandTotal),
            r.zatcaStatus,
            r.invoiceNumberSnapshot,
          ]),
        ),
      )
    }

    if (entity === 'debitNotes') {
      if (!can('DebitNote')) return jsonError(403, 'FORBIDDEN', 'Not allowed')
      const rows = await prisma.debitNote.findMany({
        where: { businessProfileId: id, ...WHERE_NOT_DELETED },
        orderBy: [{ noteDate: 'desc' }, { createdAt: 'desc' }],
        take: EXPORT_LIMIT,
        select: {
          debitNoteNumber: true,
          noteDate: true,
          grandTotal: true,
          zatcaStatus: true,
          invoiceNumberSnapshot: true,
        },
      })
      return csvResponse(
        'hisabi-pos-debit-notes.csv',
        toCsv(
          ['Debit note #', 'Date', 'Total', 'ZATCA', 'Invoice #'],
          rows.map((r) => [
            r.debitNoteNumber,
            r.noteDate?.toISOString?.()?.slice(0, 10) ?? '',
            String(r.grandTotal),
            r.zatcaStatus,
            r.invoiceNumberSnapshot,
          ]),
        ),
      )
    }

    if (entity === 'employees') {
      if (!can('Employee')) return jsonError(403, 'FORBIDDEN', 'Not allowed')
      const rows = await prisma.employee.findMany({
        where: { businessProfileId: id, ...WHERE_NOT_DELETED },
        orderBy: { name: 'asc' },
        take: EXPORT_LIMIT,
        select: {
          name: true,
          emailOfficial: true,
          mobileOfficial: true,
          status: true,
          salary: true,
          joiningDate: true,
        },
      })
      return csvResponse(
        'hisabi-pos-employees.csv',
        toCsv(
          ['Name', 'Email', 'Mobile', 'Status', 'Salary', 'Joining date'],
          rows.map((r) => [
            r.name,
            r.emailOfficial,
            r.mobileOfficial,
            r.status,
            String(r.salary),
            r.joiningDate?.toISOString?.()?.slice(0, 10) ?? '',
          ]),
        ),
      )
    }

    if (entity === 'salarySlips') {
      if (!can('SalarySlip')) return jsonError(403, 'FORBIDDEN', 'Not allowed')
      const rows = await prisma.salarySlip.findMany({
        where: { businessProfileId: id, ...WHERE_NOT_DELETED },
        orderBy: [{ createdAt: 'desc' }],
        take: EXPORT_LIMIT,
        select: {
          voucherNumber: true,
          slipDate: true,
          netTotal: true,
          employee: { select: { name: true } },
        },
      })
      return csvResponse(
        'hisabi-pos-salary-slips.csv',
        toCsv(
          ['Voucher #', 'Employee', 'Slip date', 'Net total'],
          rows.map((r) => [
            r.voucherNumber,
            r.employee?.name ?? '',
            r.slipDate?.toISOString?.()?.slice(0, 10) ?? '',
            String(r.netTotal),
          ]),
        ),
      )
    }

    return jsonError(400, 'VALIDATION_ERROR', 'Unknown export entity')
  } catch (err) {
    return handleRouteError(err, 'GET /api/auth/settings/data-export')
  }
}
