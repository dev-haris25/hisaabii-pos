import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../../src/generated/prisma/client.ts'
import { Pool } from 'pg'

/** @param {string} raw */
function connectionStringForPool(raw) {
  const s = raw.replace(/([?&])sslmode=[^&]*/gi, '$1')
  return s.replace(/\?&/, '?').replace(/[?&]$/, '')
}

export function createPrisma() {
  const connectionString = process.env.DATABASE_URL?.trim()
  if (!connectionString) throw new Error('DATABASE_URL is not set')
  const useSsl =
    process.env.DATABASE_SSL === 'true' || /sslmode=/i.test(connectionString)
  const pool = new Pool({
    connectionString: connectionStringForPool(connectionString),
    ssl: useSsl ? { rejectUnauthorized: false } : undefined,
  })
  return new PrismaClient({ adapter: new PrismaPg(pool) })
}

export function log(msg) {
  console.info(`[seed-demo-dev] ${msg}`)
}
