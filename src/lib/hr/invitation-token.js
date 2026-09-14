import crypto from 'node:crypto'

import { signPayload } from '@/lib/auth/token'

const INVITE_TTL_DAYS = 7

/** @param {string} token */
export function hashInvitationToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex')
}

/**
 * @param {{ invitationId: string, businessProfileId: string, email: string }} params
 */
export function createInvitationToken({ invitationId, businessProfileId, email }) {
  const exp = Math.floor(Date.now() / 1000) + INVITE_TTL_DAYS * 24 * 60 * 60
  return signPayload({
    purpose: 'user_invitation',
    invitationId,
    businessProfileId,
    email: email.toLowerCase(),
    exp,
  })
}

export function getInvitationExpiresAt() {
  return new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000)
}

/**
 * @param {string | undefined | null} appOrigin e.g. https://app.example.com
 * @param {string} locale
 * @param {string} token
 */
export function buildInvitationAcceptUrl(appOrigin, locale, token) {
  const base = (appOrigin || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(
    /\/$/,
    '',
  )
  return `${base}/${locale}/invite/accept?token=${encodeURIComponent(token)}`
}
