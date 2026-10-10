import { PRISMA_INTERACTIVE_TRANSACTION_OPTIONS } from '@/lib/db/prisma-interactive-transaction-options'
import { offerWithItemsInclude } from '@/lib/offers/load-active-offers'
import {
  offerBodySchema,
  validateOfferDomain,
  validateOfferMenuRefs,
} from '@/lib/offers/offer-body-schema'
import {
  offerImageErrorResponse,
  resolveOfferImagesAfterUpsert,
} from '@/lib/offers/offer-image-storage'
import { prisma } from '@/lib/prisma'

/**
 * @param {import('@/generated/prisma/client').Prisma.TransactionClient} tx
 * @param {string} offerId
 * @param {Array<{ role: string, menuItemId: string, quantity: number, discountPercent?: string | null, variantOptionIds?: string[] }>} items
 */
async function replaceOfferItems(tx, offerId, items) {
  await tx.offerItem.deleteMany({ where: { offerId } })
  for (const [index, it] of items.entries()) {
    await tx.offerItem.create({
      data: {
        offerId,
        role: /** @type {any} */ (it.role),
        menuItemId: it.menuItemId,
        quantity: it.quantity,
        discountPercent: it.discountPercent ?? null,
        sortOrder: index,
        allowedVariantOptions: {
          create: [...new Set(it.variantOptionIds ?? [])].map((variantOptionId) => ({
            variantOptionId,
          })),
        },
      },
    })
  }
}

/**
 * Create or update an offer from a request body.
 *
 * @param {{
 *   businessProfileId: string
 *   body: unknown
 *   offerId?: string | null
 * }} args
 * @returns {Promise<{ ok: true, offer: any } | { ok: false, status: number, code: string, message: string, details?: unknown }>}
 */
export async function saveOffer({ businessProfileId, body, offerId = null }) {
  const parsed = offerBodySchema.safeParse(body)
  if (!parsed.success) {
    return {
      ok: false,
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Invalid input',
      details: parsed.error.issues,
    }
  }
  const d = parsed.data

  /** @type {any} */
  let existing = null
  if (offerId) {
    existing = await prisma.offer.findFirst({
      where: { id: offerId, businessProfileId, deletedAt: null },
    })
    if (!existing) {
      return { ok: false, status: 404, code: 'OFFER_NOT_FOUND', message: 'Offer not found' }
    }
    if (existing.kind !== d.kind) {
      return {
        ok: false,
        status: 409,
        code: 'OFFER_KIND_LOCKED',
        message: 'The offer type cannot be changed after it is created',
      }
    }
  }

  const domain = validateOfferDomain(d)
  if (!domain.ok) return { ok: false, status: 400, code: domain.code, message: domain.message }

  const refs = await validateOfferMenuRefs(prisma, businessProfileId, domain.data, domain.items)
  if (!refs.ok) return { ok: false, status: 400, code: refs.code, message: refs.message }

  const saved = await prisma.$transaction(async (tx) => {
    const row = existing
      ? await tx.offer.update({ where: { id: existing.id }, data: domain.data })
      : await tx.offer.create({ data: { ...domain.data, businessProfileId } })
    await replaceOfferItems(tx, row.id, domain.items)
    return row
  }, PRISMA_INTERACTIVE_TRANSACTION_OPTIONS)

  try {
    const images = await resolveOfferImagesAfterUpsert(businessProfileId, saved.id, existing ?? {}, d)
    await prisma.offer.update({ where: { id: saved.id }, data: images })
  } catch (err) {
    const mapped = offerImageErrorResponse(err)
    if (mapped) return { ok: false, ...mapped }
    throw err
  }

  const offer = await prisma.offer.findUnique({
    where: { id: saved.id },
    include: offerWithItemsInclude,
  })
  return { ok: true, offer }
}
