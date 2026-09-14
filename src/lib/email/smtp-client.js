import nodemailer from 'nodemailer'

/** @type {import('nodemailer').Transporter | null} */
let transporter = null

/** @param {string} name @param {string} label */
function requireEnv(name, label = name) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${label} is not configured`)
  return value
}

/**
 * Module-level singleton nodemailer transporter (pooled).
 * One connection pool per process — Next API and the reminders worker
 * each get their own pool, reused across every sendMail in that process.
 */
export function getSmtpTransporter() {
  if (!transporter) {
    const host = requireEnv('SMTP_HOST')
    const portRaw = requireEnv('SMTP_PORT')
    const port = Number(portRaw)
    if (!Number.isFinite(port) || port <= 0) {
      throw new Error(`SMTP_PORT is invalid: ${portRaw}`)
    }

    const secureRaw = process.env.SMTP_SECURE?.trim().toLowerCase()
    const secure = secureRaw === 'true' || secureRaw === '1'

    const user = requireEnv('SMTP_USER')
    const pass = requireEnv('SMTP_PASSWORD')

    transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
      // Pool connections — critical for reminders sweeps (many emails/job)
      // and harmless for API-route sends (singleton reused per request process).
      pool: true,
      maxConnections: 5,
      maxMessages: 100,
    })
  }
  return transporter
}

/** Verified mailbox used in the From address, e.g. sales@hisaabii.com */
export function smtpFromEmail() {
  return requireEnv('SMTP_FROM_EMAIL')
}

/** Default display name for Hisaabii-branded mail, e.g. Hisaabii */
export function smtpFromName() {
  return requireEnv('SMTP_FROM_NAME')
}

/**
 * Build a From header: `Display Name <mailbox@domain>`.
 * @param {string} displayName
 */
export function buildSmtpFrom(displayName) {
  return `${displayName} <${smtpFromEmail()}>`
}

/** Hisaabii-branded From using SMTP_FROM_NAME + SMTP_FROM_EMAIL. */
export function hisaabiiSmtpFrom() {
  return buildSmtpFrom(smtpFromName())
}

/**
 * Send via SMTP. Throws on failure so call-site try/catch behavior stays intact.
 *
 * @param {{
 *   from: string
 *   to: string
 *   cc?: string | null
 *   replyTo?: string | null
 *   subject: string
 *   html: string
 *   text: string
 *   attachments?: Array<{ filename: string, content: Buffer | string }>
 * }} p
 */
export async function sendSmtpMail(p) {
  try {
    const info = await getSmtpTransporter().sendMail({
      from: p.from,
      to: p.to,
      ...(p.cc ? { cc: p.cc } : {}),
      ...(p.replyTo ? { replyTo: p.replyTo } : {}),
      subject: p.subject,
      html: p.html,
      text: p.text,
      ...(p.attachments?.length ? { attachments: p.attachments } : {}),
    })
    return info
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Failed to send email via SMTP'
    throw new Error(message)
  }
}
