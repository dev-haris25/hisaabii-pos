import createMiddleware from 'next-intl/middleware'
import { NextResponse } from 'next/server'

import { routing } from './i18n/routing'

const handleI18n = createMiddleware(routing)

/** @param {import('next/server').NextRequest} request */
export function proxy(request) {
  const { pathname } = request.nextUrl

  // Custom session auth (Prisma + AUTH_SECRET cookie) is handled inside API routes directly.
  if (pathname.startsWith('/api')) {
    return NextResponse.next()
  }

  return handleI18n(request)
}

export const config = {
  matcher: ['/((?!_next|_vercel|api|.*\\..*).*)'],
}
