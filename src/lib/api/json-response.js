import { NextResponse } from 'next/server'

export function jsonOk(data = {}) {
  return NextResponse.json({ ok: true, ...data })
}

export function jsonError(status, code, message, details) {
  const body = { ok: false, code, message }
  if (details !== undefined) body.details = details
  return NextResponse.json(body, { status })
}
