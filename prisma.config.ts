import 'dotenv/config'
import { defineConfig, env } from 'prisma/config'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  // Prisma ORM v7: connection URL lives here only (not in schema.prisma).
  // Without a separate pooler, DIRECT_URL and DATABASE_URL may be identical.
  // DIRECT_URL is preferred when set (e.g. migrate against a non-pooled URL).
  datasource: {
    url: process.env.DIRECT_URL || env('DATABASE_URL'),
  },
})
