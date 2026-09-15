import { Suspense } from 'react'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'

import { InvoiceEditView } from './invoice-edit-view'
import { AppLoader } from '@/components/app-loader'
import { isWithinCashierDocumentWindow } from '@/lib/auth/cashier-document-window'
import { requireInvoiceAppUser } from '@/lib/auth/require-invoice-app-user'
import { sessionNeedsCashierDocumentWindow } from '@/lib/auth/require-invoice-restaurant'
import { WHERE_NOT_DELETED } from '@/lib/db/soft-delete-scope'
import { mapInvoiceDetailToJson } from '@/lib/invoices/map-invoice-json'
import {
  mapMenuCategoryToJson,
  mapMenuItemToJson,
  menuItemInclude,
} from '@/lib/menu/map-menu-json'
import {
  canEditOrCancelInvoice,
  canRepairFailedInvoice,
} from '@/lib/notes/can-edit-or-cancel-invoice'
import { restaurantLogoPreviewUrl } from '@/lib/print/load-receipt-logo'
import { prisma } from '@/lib/prisma'

export async function generateMetadata({ params }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('Invoices')
  return { title: t('editMetaTitle') }
}

export default async function InvoiceEditPage({ params }) {
  const { locale, id } = await params
  setRequestLocale(locale)
  const user = await requireInvoiceAppUser()

  const invoice = await prisma.invoice.findFirst({
    where: {
      id,
      businessProfileId: user.businessProfileId,
      ...WHERE_NOT_DELETED,
    },
    include: {
      lines: { orderBy: { sortOrder: 'asc' } },
      createdByStaff: { select: { id: true, name: true } },
      kitchenOrder: { select: { orderNumber: true, status: true } },
    },
  })
  const canCorrection = canEditOrCancelInvoice(invoice)
  const canRepair = canRepairFailedInvoice(invoice)
  if (!invoice || (!canCorrection && !canRepair)) notFound()
  if (
    sessionNeedsCashierDocumentWindow(user) &&
    !isWithinCashierDocumentWindow(invoice.invoiceDate)
  ) {
    notFound()
  }

  const mode = canRepair ? 'repair' : 'correction'

  const [categories, items, profile] = await Promise.all([
    prisma.menuCategory.findMany({
      where: { businessProfileId: user.businessProfileId, active: true },
      orderBy: [{ sortOrder: 'asc' }, { nameAr: 'asc' }],
    }),
    prisma.menuItem.findMany({
      where: { businessProfileId: user.businessProfileId, active: true },
      orderBy: [{ sortOrder: 'asc' }, { nameAr: 'asc' }],
      include: menuItemInclude,
    }),
    prisma.businessProfile.findUnique({
      where: { id: user.businessProfileId },
      select: { id: true, logoStoragePath: true, updatedAt: true },
    }),
  ])

  const invoiceJson = mapInvoiceDetailToJson(invoice)
  const menuItemsJson = items.map(mapMenuItemToJson)
  const imageByMenuItemId = new Map(
    menuItemsJson
      .filter((item) => item.id && item.imageUrl)
      .map((item) => [item.id, item.imageUrl]),
  )
  const cartSeed = invoice.lines.map((line) => ({
    key: line.id,
    invoiceLineId: line.id,
    menuItemId: line.menuItemId ?? null,
    nameAr: line.nameAr,
    nameEn: line.nameEn,
    quantity: line.quantity,
    unitPrice: String(line.unitPrice),
    vatPreset: line.vatPreset,
    modifiersSnapshot: line.modifiersSnapshot ?? null,
    imageUrl: line.menuItemId
      ? (imageByMenuItemId.get(line.menuItemId) ?? null)
      : null,
  }))

  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-hisabi-xxl">
          <AppLoader />
        </div>
      }
    >
      <InvoiceEditView
        mode={mode}
        invoice={invoiceJson}
        cartSeed={cartSeed}
        categories={categories.map(mapMenuCategoryToJson)}
        menuItems={menuItemsJson}
        logoUrl={restaurantLogoPreviewUrl(profile)}
      />
    </Suspense>
  )
}
