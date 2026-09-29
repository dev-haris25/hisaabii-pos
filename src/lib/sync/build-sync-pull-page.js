import { prisma } from '@/lib/prisma'
import {
  decodePullCursor,
  encodePullCursor,
  pullPhaseCount,
  pullPhaseName,
} from '@/lib/sync/pull-cursor'

const PAGE_SIZE = 100
const KITCHEN_LOOKBACK_DAYS = 7
const MOVEMENT_LOOKBACK_DAYS = 14
const INVOICE_LOOKBACK_DAYS = 30

/**
 * @param {Date | string | null | undefined} value
 */
function iso(value) {
  if (!value) return null
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

/**
 * @param {import('@/generated/prisma').BusinessProfile} row
 */
function mapBusinessProfile(row) {
  return {
    id: row.id,
    updatedAt: iso(row.updatedAt),
    payload: {
      id: row.id,
      ownerUserId: row.ownerUserId,
      companyNameAr: row.companyNameAr,
      companyNameEn: row.companyNameEn,
      crNumber: row.crNumber,
      vatNumber: row.vatNumber,
      addressAr: row.addressAr,
      addressEn: row.addressEn,
      streetAr: row.streetAr,
      streetEn: row.streetEn,
      districtAr: row.districtAr,
      districtEn: row.districtEn,
      cityAr: row.cityAr,
      cityEn: row.cityEn,
      buildingNumber: row.buildingNumber,
      secondaryNumber: row.secondaryNumber,
      postalCode: row.postalCode,
      shortAddress: row.shortAddress,
      email: row.email,
      phone: row.phone,
      defaultVatPercent: row.defaultVatPercent,
      slug: row.slug,
      customerQueueLocale: row.customerQueueLocale,
      zatcaOnboardingSkipped: row.zatcaOnboardingSkipped,
      zatcaEnvironment: row.zatcaEnvironment,
      updatedAt: iso(row.updatedAt),
    },
  }
}

/**
 * Build one page of restaurant sync data for the desktop till.
 *
 * @param {string} businessProfileId
 * @param {string | null | undefined} cursorRaw
 */
export async function buildSyncPullPage(businessProfileId, cursorRaw) {
  const cursor = decodePullCursor(cursorRaw)
  const phaseCount = pullPhaseCount()

  if (cursor.m === 'inc') {
    return buildIncrementalPull(businessProfileId, cursor.t)
  }

  const phaseIndex = cursor.p
  const offset = cursor.o
  const phase = pullPhaseName(phaseIndex)

  if (phase === 'done') {
    const now = new Date().toISOString()
    return {
      businessProfileId,
      mode: 'full',
      done: true,
      nextCursor: encodePullCursor({ m: 'inc', t: now }),
      progress: {
        phase: 'done',
        phaseIndex: phaseCount - 1,
        phaseCount,
        percent: 100,
      },
      entities: {},
    }
  }

  /** @type {Record<string, unknown>} */
  const entities = {}
  let nextP = phaseIndex
  let nextO = 0
  let done = false

  if (phase === 'bootstrap') {
    const [profile, settings, tills, zatca, invCounter] = await Promise.all([
      prisma.businessProfile.findUnique({ where: { id: businessProfileId } }),
      prisma.businessSettings.findUnique({ where: { businessProfileId } }),
      prisma.posTill.findMany({
        where: { businessProfileId },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.zatcaDevice.findUnique({ where: { businessProfileId } }),
      prisma.invoiceCounter.findUnique({ where: { businessProfileId } }),
    ])
    if (!profile) {
      const err = new Error('PROFILE_NOT_FOUND')
      // @ts-expect-error
      err.code = 'PROFILE_NOT_FOUND'
      throw err
    }
    entities.businessProfile = mapBusinessProfile(profile)
    entities.businessSettings = settings
      ? {
          businessProfileId: settings.businessProfileId,
          updatedAt: iso(settings.updatedAt),
          payload: settings,
        }
      : null
    entities.invoiceCounter = {
      businessProfileId,
      lastNumber: invCounter?.lastNumber ?? 0,
      updatedAt: iso(invCounter?.updatedAt ?? new Date()),
    }
    entities.tills = tills.map((t) => ({
      id: t.id,
      businessProfileId: t.businessProfileId,
      name: t.name,
      updatedAt: iso(t.updatedAt),
      payload: t,
    }))
    entities.zatcaDeviceTip = zatca
      ? {
          businessProfileId: zatca.businessProfileId,
          invoiceCounter: zatca.invoiceCounter,
          lastInvoiceHash: zatca.lastInvoiceHash || '',
          environment: zatca.environment,
          updatedAt: iso(zatca.updatedAt),
          payload: {
            id: zatca.id,
            environment: zatca.environment,
            egsSerialNumber: zatca.egsSerialNumber,
            complianceCsid: zatca.complianceCsid,
            productionCsid: zatca.productionCsid,
            onboardedAt: iso(zatca.onboardedAt),
            invoiceCounter: zatca.invoiceCounter,
            lastInvoiceHash: zatca.lastInvoiceHash || '',
          },
        }
      : null
    nextP = phaseIndex + 1
    nextO = 0
  } else if (phase === 'auth') {
    const memberships = await prisma.businessMembership.findMany({
      where: { businessProfileId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            passwordHash: true,
            active: true,
            emailVerified: true,
            activeBusinessProfileId: true,
            preferredLocale: true,
            updatedAt: true,
          },
        },
        employeeRoles: { select: { roleId: true, businessMembershipId: true } },
      },
      orderBy: { createdAt: 'asc' },
      skip: offset,
      take: PAGE_SIZE,
    })
    const roles = await prisma.role.findMany({
      where: { businessProfileId },
      include: { permissions: true },
      orderBy: { createdAt: 'asc' },
    })
    entities.roles = roles.map((r) => ({
      id: r.id,
      businessProfileId: r.businessProfileId,
      key: r.name,
      name: r.name,
      updatedAt: iso(r.updatedAt),
      payload: {
        id: r.id,
        businessProfileId: r.businessProfileId,
        name: r.name,
        isSystem: r.isSystem,
      },
    }))
    entities.rolePermissions = roles.flatMap((r) =>
      r.permissions.map((p) => ({
        id: p.id,
        roleId: p.roleId,
        action: p.action,
        subject: p.subject,
      })),
    )
    entities.users = memberships.map((m) => ({
      id: m.user.id,
      email: m.user.email,
      name: m.user.name,
      passwordHash: m.user.passwordHash,
      activeBusinessProfileId: m.user.activeBusinessProfileId,
      updatedAt: iso(m.user.updatedAt),
      payload: {
        id: m.user.id,
        email: m.user.email,
        name: m.user.name,
        active: m.user.active,
        emailVerified: m.user.emailVerified,
        preferredLocale: m.user.preferredLocale,
      },
    }))
    entities.memberships = memberships.map((m) => ({
      id: m.id,
      userId: m.userId,
      businessProfileId: m.businessProfileId,
      updatedAt: iso(m.updatedAt),
      payload: {
        id: m.id,
        userId: m.userId,
        businessProfileId: m.businessProfileId,
        emailHighWasteReports: m.emailHighWasteReports,
      },
    }))
    entities.employeeRoles = memberships.flatMap((m) =>
      m.employeeRoles.map((er) => ({
        membershipId: er.businessMembershipId,
        roleId: er.roleId,
      })),
    )
    if (memberships.length < PAGE_SIZE) {
      nextP = phaseIndex + 1
      nextO = 0
    } else {
      nextP = phaseIndex
      nextO = offset + memberships.length
    }
  } else if (phase === 'menuCategories') {
    const rows = await prisma.menuCategory.findMany({
      where: { businessProfileId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      skip: offset,
      take: PAGE_SIZE,
    })
    entities.menuCategories = rows.map((r) => ({
      id: r.id,
      businessProfileId: r.businessProfileId,
      sortOrder: r.sortOrder,
      updatedAt: iso(r.updatedAt),
      payload: r,
    }))
    if (rows.length < PAGE_SIZE) {
      nextP = phaseIndex + 1
      nextO = 0
    } else {
      nextP = phaseIndex
      nextO = offset + rows.length
    }
  } else if (phase === 'menuItems') {
    const rows = await prisma.menuItem.findMany({
      where: { businessProfileId, active: true },
      include: {
        variantGroups: { include: { options: true }, orderBy: { sortOrder: 'asc' } },
        customizations: { orderBy: { sortOrder: 'asc' } },
        recipe: {
          include: {
            ingredients: {
              orderBy: { sortOrder: 'asc' },
              include: {
                stockItem: {
                  select: {
                    id: true,
                    nameAr: true,
                    nameEn: true,
                    unit: true,
                    quantityOnHand: true,
                    active: true,
                    unitCost: true,
                    isBulk: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      skip: offset,
      take: PAGE_SIZE,
    })
    entities.menuItems = rows.map((r) => {
      const { recipe, ...rest } = r
      return {
        id: r.id,
        businessProfileId: r.businessProfileId,
        categoryId: r.categoryId,
        active: r.active,
        updatedAt: iso(r.updatedAt),
        payload: rest,
      }
    })
    entities.menuItemVariants = rows.flatMap((r) =>
      r.variantGroups.map((g) => ({
        id: g.id,
        menuItemId: r.id,
        updatedAt: iso(g.updatedAt),
        payload: g,
      })),
    )
    entities.menuItemCustomizations = rows.flatMap((r) =>
      r.customizations.map((c) => ({
        id: c.id,
        menuItemId: r.id,
        updatedAt: iso(c.updatedAt),
        payload: c,
      })),
    )
    entities.menuItemRecipes = rows
      .filter((r) => r.recipe)
      .map((r) => ({
        menuItemId: r.id,
        businessProfileId: r.businessProfileId,
        updatedAt: iso(r.recipe.updatedAt),
        payload: {
          id: r.recipe.id,
          menuItemId: r.id,
          steps: r.recipe.steps,
          stepsAr: r.recipe.stepsAr,
          ingredients: r.recipe.ingredients,
        },
      }))
    if (rows.length < PAGE_SIZE) {
      nextP = phaseIndex + 1
      nextO = 0
    } else {
      nextP = phaseIndex
      nextO = offset + rows.length
    }
  } else if (phase === 'kitchenOrders') {
    const since = new Date()
    since.setDate(since.getDate() - KITCHEN_LOOKBACK_DAYS)
    const rows = await prisma.kitchenOrder.findMany({
      where: {
        businessProfileId,
        OR: [{ status: { not: 'completed' } }, { updatedAt: { gte: since } }],
      },
      orderBy: { updatedAt: 'desc' },
      skip: offset,
      take: PAGE_SIZE,
    })
    entities.kitchenOrders = rows.map((r) => ({
      id: r.id,
      businessProfileId: r.businessProfileId,
      status: r.status,
      updatedAt: iso(r.updatedAt),
      payload: r,
    }))
    if (rows.length < PAGE_SIZE) {
      nextP = phaseIndex + 1
      nextO = 0
    } else {
      nextP = phaseIndex
      nextO = offset + rows.length
    }
  } else if (phase === 'stockItems') {
    const rows = await prisma.stockItem.findMany({
      where: { businessProfileId, active: true },
      orderBy: { updatedAt: 'desc' },
      skip: offset,
      take: PAGE_SIZE,
    })
    entities.stockItems = rows.map((r) => ({
      id: r.id,
      businessProfileId: r.businessProfileId,
      updatedAt: iso(r.updatedAt),
      payload: r,
    }))
    if (rows.length < PAGE_SIZE) {
      nextP = phaseIndex + 1
      nextO = 0
    } else {
      nextP = phaseIndex
      nextO = offset + rows.length
    }
  } else if (phase === 'stockMovements') {
    const since = new Date()
    since.setDate(since.getDate() - MOVEMENT_LOOKBACK_DAYS)
    const rows = await prisma.stockMovement.findMany({
      where: { businessProfileId, createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      skip: offset,
      take: PAGE_SIZE,
    })
    entities.stockMovements = rows.map((r) => ({
      id: r.id,
      businessProfileId: r.businessProfileId,
      stockItemId: r.stockItemId,
      createdAt: iso(r.createdAt),
      payload: r,
    }))
    if (rows.length < PAGE_SIZE) {
      nextP = phaseIndex + 1
      nextO = 0
    } else {
      nextP = phaseIndex
      nextO = offset + rows.length
    }
  } else if (phase === 'invoices') {
    const since = new Date()
    since.setDate(since.getDate() - INVOICE_LOOKBACK_DAYS)
    const rows = await prisma.invoice.findMany({
      where: {
        businessProfileId,
        deletedAt: null,
        updatedAt: { gte: since },
      },
      include: { lines: { orderBy: { sortOrder: 'asc' } } },
      orderBy: { updatedAt: 'desc' },
      skip: offset,
      take: PAGE_SIZE,
    })
    entities.invoices = rows.map((r) => ({
      id: r.id,
      businessProfileId: r.businessProfileId,
      invoiceNumber: r.invoiceNumber,
      zatcaStatus: r.zatcaStatus,
      updatedAt: iso(r.updatedAt),
      payload: r,
      lines: r.lines.map((l) => ({
        id: l.id,
        payload: l,
      })),
    }))
    if (rows.length < PAGE_SIZE) {
      nextP = phaseIndex + 1
      nextO = 0
    } else {
      nextP = phaseIndex
      nextO = offset + rows.length
    }
  }

  if (pullPhaseName(nextP) === 'done') {
    done = true
  }

  const percent = Math.min(
    99,
    Math.round(((phaseIndex + (done ? 1 : 0)) / Math.max(phaseCount - 1, 1)) * 100),
  )

  return {
    businessProfileId,
    mode: 'full',
    done,
    nextCursor: encodePullCursor(
      done
        ? { m: 'inc', t: new Date().toISOString() }
        : { m: 'full', p: nextP, o: nextO },
    ),
    progress: {
      phase,
      phaseIndex,
      phaseCount,
      percent: done ? 100 : percent,
    },
    entities,
  }
}

/**
 * @param {string} businessProfileId
 * @param {string} sinceIso
 */
async function buildIncrementalPull(businessProfileId, sinceIso) {
  const since = new Date(sinceIso)
  const sinceOk = !Number.isNaN(since.getTime()) ? since : new Date(0)
  const now = new Date().toISOString()

  const [profile, settings, tills, zatca, invCounter, memberships, roles, categories, items, kitchen, stock, movements, invoices] =
    await Promise.all([
      prisma.businessProfile.findFirst({
        where: { id: businessProfileId, updatedAt: { gt: sinceOk } },
      }),
      prisma.businessSettings.findFirst({
        where: { businessProfileId, updatedAt: { gt: sinceOk } },
      }),
      prisma.posTill.findMany({
        where: { businessProfileId, updatedAt: { gt: sinceOk } },
      }),
      prisma.zatcaDevice.findFirst({
        where: { businessProfileId, updatedAt: { gt: sinceOk } },
      }),
      prisma.invoiceCounter.findUnique({ where: { businessProfileId } }),
      prisma.businessMembership.findMany({
        where: { businessProfileId, updatedAt: { gt: sinceOk } },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
              passwordHash: true,
              active: true,
              emailVerified: true,
              activeBusinessProfileId: true,
              preferredLocale: true,
              updatedAt: true,
            },
          },
          employeeRoles: true,
        },
      }),
      prisma.role.findMany({
        where: { businessProfileId, updatedAt: { gt: sinceOk } },
        include: { permissions: true },
      }),
      prisma.menuCategory.findMany({
        where: { businessProfileId, updatedAt: { gt: sinceOk } },
      }),
      prisma.menuItem.findMany({
        where: { businessProfileId, updatedAt: { gt: sinceOk } },
        include: {
          variantGroups: { include: { options: true } },
          customizations: true,
          recipe: {
            include: {
              ingredients: {
                orderBy: { sortOrder: 'asc' },
                include: {
                  stockItem: {
                    select: {
                      id: true,
                      nameAr: true,
                      nameEn: true,
                      unit: true,
                      quantityOnHand: true,
                      active: true,
                      unitCost: true,
                      isBulk: true,
                    },
                  },
                },
              },
            },
          },
        },
      }),
      prisma.kitchenOrder.findMany({
        where: { businessProfileId, updatedAt: { gt: sinceOk } },
        take: 200,
        orderBy: { updatedAt: 'desc' },
      }),
      prisma.stockItem.findMany({
        where: { businessProfileId, updatedAt: { gt: sinceOk } },
      }),
      prisma.stockMovement.findMany({
        where: { businessProfileId, createdAt: { gt: sinceOk } },
        take: 500,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.invoice.findMany({
        where: {
          businessProfileId,
          deletedAt: null,
          updatedAt: { gt: sinceOk },
        },
        include: { lines: { orderBy: { sortOrder: 'asc' } } },
        take: 200,
        orderBy: { updatedAt: 'desc' },
      }),
    ])

  /** @type {Record<string, unknown>} */
  const entities = {}
  if (profile) entities.businessProfile = mapBusinessProfile(profile)
  if (settings) {
    entities.businessSettings = {
      businessProfileId: settings.businessProfileId,
      updatedAt: iso(settings.updatedAt),
      payload: settings,
    }
  }
  if (invCounter) {
    entities.invoiceCounter = {
      businessProfileId,
      lastNumber: invCounter.lastNumber ?? 0,
      updatedAt: iso(invCounter.updatedAt),
    }
  }
  if (tills.length) {
    entities.tills = tills.map((t) => ({
      id: t.id,
      businessProfileId: t.businessProfileId,
      name: t.name,
      updatedAt: iso(t.updatedAt),
      payload: t,
    }))
  }
  if (zatca) {
    entities.zatcaDeviceTip = {
      businessProfileId: zatca.businessProfileId,
      invoiceCounter: zatca.invoiceCounter,
      lastInvoiceHash: zatca.lastInvoiceHash || '',
      environment: zatca.environment,
      updatedAt: iso(zatca.updatedAt),
      payload: {
        id: zatca.id,
        environment: zatca.environment,
        egsSerialNumber: zatca.egsSerialNumber,
        complianceCsid: zatca.complianceCsid,
        productionCsid: zatca.productionCsid,
        onboardedAt: iso(zatca.onboardedAt),
        invoiceCounter: zatca.invoiceCounter,
        lastInvoiceHash: zatca.lastInvoiceHash || '',
      },
    }
  }
  if (roles.length) {
    entities.roles = roles.map((r) => ({
      id: r.id,
      businessProfileId: r.businessProfileId,
      key: r.name,
      name: r.name,
      updatedAt: iso(r.updatedAt),
      payload: {
        id: r.id,
        businessProfileId: r.businessProfileId,
        name: r.name,
        isSystem: r.isSystem,
      },
    }))
    entities.rolePermissions = roles.flatMap((r) =>
      (r.permissions || []).map((p) => ({
        id: p.id,
        roleId: p.roleId,
        action: p.action,
        subject: p.subject,
      })),
    )
  }
  if (memberships.length) {
    entities.users = memberships.map((m) => ({
      id: m.user.id,
      email: m.user.email,
      name: m.user.name,
      passwordHash: m.user.passwordHash,
      activeBusinessProfileId: m.user.activeBusinessProfileId,
      updatedAt: iso(m.user.updatedAt),
      payload: {
        id: m.user.id,
        email: m.user.email,
        name: m.user.name,
        active: m.user.active,
        emailVerified: m.user.emailVerified,
        preferredLocale: m.user.preferredLocale,
      },
    }))
    entities.memberships = memberships.map((m) => ({
      id: m.id,
      userId: m.userId,
      businessProfileId: m.businessProfileId,
      updatedAt: iso(m.updatedAt),
      payload: {
        id: m.id,
        userId: m.userId,
        businessProfileId: m.businessProfileId,
        emailHighWasteReports: m.emailHighWasteReports,
      },
    }))
    entities.employeeRoles = memberships.flatMap((m) =>
      m.employeeRoles.map((er) => ({
        membershipId: er.businessMembershipId,
        roleId: er.roleId,
      })),
    )
  }
  if (categories.length) {
    entities.menuCategories = categories.map((r) => ({
      id: r.id,
      businessProfileId: r.businessProfileId,
      sortOrder: r.sortOrder,
      updatedAt: iso(r.updatedAt),
      payload: r,
    }))
  }
  if (items.length) {
    entities.menuItems = items.map((r) => {
      const { recipe, ...rest } = r
      return {
        id: r.id,
        businessProfileId: r.businessProfileId,
        categoryId: r.categoryId,
        active: r.active,
        updatedAt: iso(r.updatedAt),
        payload: rest,
      }
    })
    entities.menuItemVariants = items.flatMap((r) =>
      r.variantGroups.map((g) => ({
        id: g.id,
        menuItemId: r.id,
        updatedAt: iso(g.updatedAt),
        payload: g,
      })),
    )
    entities.menuItemCustomizations = items.flatMap((r) =>
      r.customizations.map((c) => ({
        id: c.id,
        menuItemId: r.id,
        updatedAt: iso(c.updatedAt),
        payload: c,
      })),
    )
    entities.menuItemRecipes = items
      .filter((r) => r.recipe)
      .map((r) => ({
        menuItemId: r.id,
        businessProfileId: r.businessProfileId,
        updatedAt: iso(r.recipe.updatedAt),
        payload: {
          id: r.recipe.id,
          menuItemId: r.id,
          steps: r.recipe.steps,
          stepsAr: r.recipe.stepsAr,
          ingredients: r.recipe.ingredients,
        },
      }))
  }
  if (kitchen.length) {
    entities.kitchenOrders = kitchen.map((r) => ({
      id: r.id,
      businessProfileId: r.businessProfileId,
      status: r.status,
      updatedAt: iso(r.updatedAt),
      payload: r,
    }))
  }
  if (stock.length) {
    entities.stockItems = stock.map((r) => ({
      id: r.id,
      businessProfileId: r.businessProfileId,
      updatedAt: iso(r.updatedAt),
      payload: r,
    }))
  }
  if (movements.length) {
    entities.stockMovements = movements.map((r) => ({
      id: r.id,
      businessProfileId: r.businessProfileId,
      stockItemId: r.stockItemId,
      createdAt: iso(r.createdAt),
      payload: r,
    }))
  }
  if (invoices.length) {
    entities.invoices = invoices.map((r) => ({
      id: r.id,
      businessProfileId: r.businessProfileId,
      invoiceNumber: r.invoiceNumber,
      zatcaStatus: r.zatcaStatus,
      updatedAt: iso(r.updatedAt),
      payload: r,
      lines: r.lines.map((l) => ({
        id: l.id,
        payload: l,
      })),
    }))
  }

  return {
    businessProfileId,
    mode: 'incremental',
    done: true,
    nextCursor: encodePullCursor({ m: 'inc', t: now }),
    progress: {
      phase: 'incremental',
      phaseIndex: pullPhaseCount() - 1,
      phaseCount: pullPhaseCount(),
      percent: 100,
    },
    entities,
  }
}
