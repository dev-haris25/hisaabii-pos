import { NextResponse } from 'next/server'

import { clearSessionCookie } from '@/lib/auth/attach-session-cookie'
import { jsonOk } from '@/lib/api/json-response'

export async function POST() {
  const res = NextResponse.json({ ok: true })
  clearSessionCookie(res)
  return res
}

/** Also allow GET for simple link logout. */
export async function GET() {
  return POST()
}
