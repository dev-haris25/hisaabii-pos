import { WHERE_NOT_DELETED } from '@/lib/db/soft-delete-scope'
import { prisma } from '@/lib/prisma'

/** Max hits returned per entity group in the header dropdown. */
export const GLOBAL_SEARCH_LIMIT = 5

/** Minimum trimmed query length before any database work runs. */
export const GLOBAL_SEARCH_MIN_LENGTH = 1

/** Max query length (matches Hisabi / client). */
export const GLOBAL_SEARCH_MAX_LENGTH = 120

/**
 * @param {unknown} raw
 */
export function normalizeSearchQuery(raw) {
  return String(raw ?? '')
    .trim()
    .slice(0, GLOBAL_SEARCH_MAX_LENGTH)
}

/**
 * @param {import('@casl/ability').MongoAbility | null | undefined} ability
 * @param {string} subject
 */
function canReadSubject(ability, subject) {
  if (!ability) return false
  return (
    ability.can('manage', 'all') ||
    ability.can('manage', subject) ||
    ability.can('read', subject)
  )
}

/**
 * Which entity groups the caller may search (CASL read).
 *
 * @param {import('@casl/ability').MongoAbility | null | undefined} ability
 */
export function resolveSearchableGroups(ability) {
  return {
    menuItems: canReadSubject(ability, 'MenuItem'),
    menuCategories: canReadSubject(ability, 'MenuCategory'),
    invoices: canReadSubject(ability, 'Invoice'),
    creditNotes: canReadSubject(ability, 'CreditNote'),
    debitNotes: canReadSubject(ability, 'DebitNote'),
    employees: canReadSubject(ability, 'Employee'),
  }
}

/**
 * @returns {{
 *   menuItems: never[]
 *   menuCategories: never[]
 *   invoices: never[]
 *   creditNotes: never[]
 *   debitNotes: never[]
 *   employees: never[]
 * }}
 */
export function emptyGlobalSearchResult() {
  return {
    menuItems: [],
    menuCategories: [],
    invoices: [],
    creditNotes: [],
    debitNotes: [],
    employees: [],
  }
}

/**
 * Universal header search across POS modules. Skips any entity type the caller
 * cannot read — no query is issued for denied subjects.
 *
 * @param {string} businessProfileId
 * @param {import('@casl/ability').MongoAbility} ability
 * @param {unknown} rawQuery
 */
export async function globalSearch(businessProfileId, ability, rawQuery) {
  const q = normalizeSearchQuery(rawQuery)
  const empty = emptyGlobalSearchResult()
  if (!businessProfileId || !q || q.length < GLOBAL_SEARCH_MIN_LENGTH) {
    return empty
  }

  const scopes = resolveSearchableGroups(ability)
  /** @type {Promise<void>[]} */
  const tasks = []

  if (scopes.menuItems) {
    tasks.push(
      searchMenuItems(businessProfileId, q).then((rows) => {
        empty.menuItems = rows
      }),
    )
  }
  if (scopes.menuCategories) {
    tasks.push(
      searchMenuCategories(businessProfileId, q).then((rows) => {
        empty.menuCategories = rows
      }),
    )
  }
  if (scopes.invoices) {
    tasks.push(
      searchInvoices(businessProfileId, q).then((rows) => {
        empty.invoices = rows
      }),
    )
  }
  if (scopes.creditNotes) {
    tasks.push(
      searchCreditNotes(businessProfileId, q).then((rows) => {
        empty.creditNotes = rows
      }),
    )
  }
  if (scopes.debitNotes) {
    tasks.push(
      searchDebitNotes(businessProfileId, q).then((rows) => {
        empty.debitNotes = rows
      }),
    )
  }
  if (scopes.employees) {
    tasks.push(
      searchEmployees(businessProfileId, q).then((rows) => {
        empty.employees = rows
      }),
    )
  }

  await Promise.all(tasks)
  return empty
}

/**
 * @param {string} businessProfileId
 * @param {string} q
 */
async function searchMenuItems(businessProfileId, q) {
  const rows = await prisma.menuItem.findMany({
    where: {
      businessProfileId,
      OR: [
        { nameAr: { contains: q, mode: 'insensitive' } },
        { nameEn: { contains: q, mode: 'insensitive' } },
      ],
    },
    select: {
      id: true,
      nameAr: true,
      nameEn: true,
      price: true,
      category: { select: { nameEn: true, nameAr: true } },
    },
    orderBy: { updatedAt: 'desc' },
    take: GLOBAL_SEARCH_LIMIT,
  })

  return rows.map((row) => ({
    id: row.id,
    type: 'menuItem',
    title: row.nameEn?.trim() || row.nameAr,
    subtitle:
      row.category?.nameEn?.trim() ||
      row.category?.nameAr?.trim() ||
      (row.price ? `SAR ${row.price}` : null),
    href: `/menu/items/${row.id}/edit`,
  }))
}

/**
 * @param {string} businessProfileId
 * @param {string} q
 */
async function searchMenuCategories(businessProfileId, q) {
  const rows = await prisma.menuCategory.findMany({
    where: {
      businessProfileId,
      OR: [
        { nameAr: { contains: q, mode: 'insensitive' } },
        { nameEn: { contains: q, mode: 'insensitive' } },
      ],
    },
    select: {
      id: true,
      nameAr: true,
      nameEn: true,
    },
    orderBy: [{ sortOrder: 'asc' }, { nameAr: 'asc' }],
    take: GLOBAL_SEARCH_LIMIT,
  })

  return rows.map((row) => ({
    id: row.id,
    type: 'menuCategory',
    title: row.nameEn?.trim() || row.nameAr,
    subtitle: null,
    href: '/menu/categories',
  }))
}

/**
 * @param {string} businessProfileId
 * @param {string} q
 */
async function searchInvoices(businessProfileId, q) {
  const rows = await prisma.invoice.findMany({
    where: {
      businessProfileId,
      ...WHERE_NOT_DELETED,
      OR: [
        { invoiceNumber: { contains: q, mode: 'insensitive' } },
        { notes: { contains: q, mode: 'insensitive' } },
      ],
    },
    select: {
      id: true,
      invoiceNumber: true,
      grandTotal: true,
      paymentMethod: true,
      notes: true,
    },
    orderBy: { createdAt: 'desc' },
    take: GLOBAL_SEARCH_LIMIT,
  })

  return rows.map((row) => ({
    id: row.id,
    type: 'invoice',
    title: row.invoiceNumber,
    subtitle:
      row.grandTotal != null
        ? `SAR ${row.grandTotal}${row.paymentMethod ? ` · ${row.paymentMethod}` : ''}`
        : row.notes?.trim() || null,
    href: `/invoices/${row.id}`,
  }))
}

/**
 * @param {string} businessProfileId
 * @param {string} q
 */
async function searchCreditNotes(businessProfileId, q) {
  const rows = await prisma.creditNote.findMany({
    where: {
      businessProfileId,
      ...WHERE_NOT_DELETED,
      OR: [
        { creditNoteNumber: { contains: q, mode: 'insensitive' } },
        { invoiceNumberSnapshot: { contains: q, mode: 'insensitive' } },
        { reasonAr: { contains: q, mode: 'insensitive' } },
        { reasonEn: { contains: q, mode: 'insensitive' } },
      ],
    },
    select: {
      id: true,
      creditNoteNumber: true,
      invoiceNumberSnapshot: true,
      grandTotal: true,
    },
    orderBy: { createdAt: 'desc' },
    take: GLOBAL_SEARCH_LIMIT,
  })

  return rows.map((row) => ({
    id: row.id,
    type: 'creditNote',
    title: row.creditNoteNumber,
    subtitle:
      row.invoiceNumberSnapshot?.trim() ||
      (row.grandTotal != null ? `SAR ${row.grandTotal}` : null),
    href: `/invoices/credit-notes/${row.id}`,
  }))
}

/**
 * @param {string} businessProfileId
 * @param {string} q
 */
async function searchDebitNotes(businessProfileId, q) {
  const rows = await prisma.debitNote.findMany({
    where: {
      businessProfileId,
      ...WHERE_NOT_DELETED,
      OR: [
        { debitNoteNumber: { contains: q, mode: 'insensitive' } },
        { invoiceNumberSnapshot: { contains: q, mode: 'insensitive' } },
        { reasonAr: { contains: q, mode: 'insensitive' } },
        { reasonEn: { contains: q, mode: 'insensitive' } },
      ],
    },
    select: {
      id: true,
      debitNoteNumber: true,
      invoiceNumberSnapshot: true,
      grandTotal: true,
    },
    orderBy: { createdAt: 'desc' },
    take: GLOBAL_SEARCH_LIMIT,
  })

  return rows.map((row) => ({
    id: row.id,
    type: 'debitNote',
    title: row.debitNoteNumber,
    subtitle:
      row.invoiceNumberSnapshot?.trim() ||
      (row.grandTotal != null ? `SAR ${row.grandTotal}` : null),
    href: `/invoices/debit-notes/${row.id}`,
  }))
}

/**
 * @param {string} businessProfileId
 * @param {string} q
 */
async function searchEmployees(businessProfileId, q) {
  const rows = await prisma.employee.findMany({
    where: {
      businessProfileId,
      ...WHERE_NOT_DELETED,
      OR: [
        { name: { contains: q, mode: 'insensitive' } },
        { emailOfficial: { contains: q, mode: 'insensitive' } },
        { mobileOfficial: { contains: q, mode: 'insensitive' } },
        { idNumber: { contains: q, mode: 'insensitive' } },
      ],
    },
    select: {
      id: true,
      name: true,
      emailOfficial: true,
      mobileOfficial: true,
      idNumber: true,
    },
    orderBy: { name: 'asc' },
    take: GLOBAL_SEARCH_LIMIT,
  })

  return rows.map((row) => ({
    id: row.id,
    type: 'employee',
    title: row.name,
    subtitle:
      row.emailOfficial || row.mobileOfficial || row.idNumber || null,
    href: `/hr/employees/${row.id}`,
  }))
}
