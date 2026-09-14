import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

import { PrismaClient } from '@/generated/prisma/client'

const globalForPrisma = globalThis

/** @type {PrismaClient | undefined} */
const existing = globalForPrisma.prisma

/** pg v8 treats sslmode=require as verify-full; strip it and set ssl on the Pool instead. */
function connectionStringForPool(raw) {
  const s = raw.replace(/([?&])sslmode=[^&]*/gi, '$1')
  return s.replace(/\?&/, '?').replace(/[?&]$/, '')
}

function createPool() {
  const connectionString = process.env.DATABASE_URL?.trim()
  if (!connectionString) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('DATABASE_URL is required in production')
    }
    throw new Error('DATABASE_URL is not set')
  }

  // Self-hosted / private-network Postgres usually needs no SSL. Enable with
  // DATABASE_SSL=true or by including sslmode= in DATABASE_URL.
  const useSsl = process.env.DATABASE_SSL === 'true' || /sslmode=/i.test(connectionString)

  return new Pool({
    connectionString: connectionStringForPool(connectionString),
    ssl: useSsl ? { rejectUnauthorized: false } : undefined,
    // Tunable via DATABASE_POOL_MAX (default 10).
    max: (() => {
      const raw = process.env.DATABASE_POOL_MAX?.trim()
      const parsed = raw ? Number.parseInt(raw, 10) : NaN
      return Number.isFinite(parsed) && parsed > 0 ? parsed : 10
    })(),
  })
}

function createClient() {
  const pool = createPool()
  const adapter = new PrismaPg(pool)
  return new PrismaClient({ adapter })
}

export const prisma = existing ?? createClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}
