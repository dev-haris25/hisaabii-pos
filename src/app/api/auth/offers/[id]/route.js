import { jsonError, jsonOk } from '@/lib/api/json-response'
import { handleRouteError } from '@/lib/api/route-error'
import { offerWithItemsInclude } from '@/lib/offers/load-active-offers'
import { mapOfferAdminJson } from '@/lib/offers/map-offer-json'
import { saveOffer } from '@/lib/offers/save-offer'
import { prisma } from '@/lib/prisma'
import { authorizeBusinessRequest } from '@/lib/rbac/authorize-api-request'

/**
 * @param {string} businessProfileId
 * @param {string} id
 */
function loadOwnedOffer(businessProfileId, id) {
  return prisma.offer.findFirst({
    where: { id, businessProfileId, deletedAt: null },
    include: offerWithItemsInclude,
  })
}

export async function GET(request, context) {
  try {
    const auth = await authorizeBusinessRequest(request)
    if (auth.error) return auth.error
    const { id } = await context.params
    const offer = await loadOwnedOffer(auth.profile.id, id)
    if (!offer) return jsonError(404, 'OFFER_NOT_FOUND', 'Offer not found')
    return jsonOk({ offer: mapOfferAdminJson(offer) })
  } catch (err) {
    return handleRouteError(err, 'GET /api/auth/offers/[id]')
  }
}

/** PATCH — full form save. The offer type (kind) is locked after create. */
export async function PATCH(request, context) {
  try {
    const auth = await authorizeBusinessRequest(request)
    if (auth.error) return auth.error
    const { id } = await context.params

    let body
    try {
      body = await request.json()
    } catch {
      return jsonError(400, 'INVALID_JSON', 'Invalid JSON')
    }

    // Quick on/off toggle from the list: `{ active }` only, no full re-validation.
    if (
      body &&
      typeof body === 'object' &&
      Object.keys(body).length === 1 &&
      typeof body.active === 'boolean'
    ) {
      const toggled = await prisma.offer.updateMany({
        where: { id, businessProfileId: auth.profile.id, deletedAt: null },
        data: { active: body.active },
      })
      if (toggled.count !== 1) {
        return jsonError(404, 'OFFER_NOT_FOUND', 'Offer not found')
      }
      const offer = await loadOwnedOffer(auth.profile.id, id)
      return jsonOk({ offer: mapOfferAdminJson(offer) })
    }

    const saved = await saveOffer({
      businessProfileId: auth.profile.id,
      body,
      offerId: id,
    })
    if (!saved.ok) {
      return jsonError(saved.status, saved.code, saved.message, saved.details)
    }
    return jsonOk({ offer: mapOfferAdminJson(saved.offer) })
  } catch (err) {
    return handleRouteError(err, 'PATCH /api/auth/offers/[id]')
  }
}

/**
 * DELETE — soft delete. Disappears from POS / menu immediately; past invoices
 * and table prices already locked keep their history.
 */
export async function DELETE(request, context) {
  try {
    const auth = await authorizeBusinessRequest(request)
    if (auth.error) return auth.error
    const { id } = await context.params
    const updated = await prisma.offer.updateMany({
      where: { id, businessProfileId: auth.profile.id, deletedAt: null },
      data: { deletedAt: new Date(), active: false },
    })
    if (updated.count !== 1) {
      return jsonError(404, 'OFFER_NOT_FOUND', 'Offer not found')
    }
    return jsonOk({ deleted: true, id })
  } catch (err) {
    return handleRouteError(err, 'DELETE /api/auth/offers/[id]')
  }
}
