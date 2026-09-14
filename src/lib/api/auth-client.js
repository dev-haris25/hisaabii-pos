export class AuthApiError extends Error {
  /**
   * @param {number} status
   * @param {string} [code]
   * @param {string} [message]
   */
  constructor(status, code, message) {
    super(message || code || String(status))
    this.name = 'AuthApiError'
    this.status = status
    this.code = code
  }
}

/**
 * @param {string} path e.g. "/register" -> POST /api/auth/register
 * @param {unknown} [body]
 */
export async function authPost(path, body) {
  const res = await fetch(`/api/auth${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  let data = {}
  try {
    data = await res.json()
  } catch {
    // ignore
  }
  if (!res.ok) {
    const code =
      typeof data.code === 'string'
        ? data.code
        : res.status === 401
          ? 'UNAUTHORIZED'
          : res.status === 403
            ? 'FORBIDDEN'
            : res.status === 404
              ? 'NOT_FOUND'
              : res.status >= 500
                ? 'SERVER_ERROR'
                : undefined
    throw new AuthApiError(
      res.status,
      code,
      typeof data.message === 'string' ? data.message : undefined,
    )
  }
  return data
}

/**
 * POST /api/auth/invoices/:id/send — streams SSE progress while submitting to ZATCA.
 *
 * @param {string} invoiceId
 * @param {{
 *   signal?: AbortSignal
 *   onStage?: (stage: string) => void
 * }} [options]
 */
export async function authPostInvoiceSendStream(invoiceId, options = {}) {
  const res = await fetch(`/api/auth/invoices/${invoiceId}/send`, {
    method: 'POST',
    credentials: 'same-origin',
    signal: options.signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })

  if (!res.ok || !res.body) {
    let data = {}
    try {
      data = await res.json()
    } catch {
      // ignore
    }
    const code =
      typeof data.code === 'string'
        ? data.code
        : res.status === 401
          ? 'UNAUTHORIZED'
          : res.status === 403
            ? 'FORBIDDEN'
            : res.status === 404
              ? 'NOT_FOUND'
              : res.status >= 500
                ? 'SERVER_ERROR'
                : undefined
    throw new AuthApiError(
      res.status,
      code,
      typeof data.message === 'string' ? data.message : undefined,
    )
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    const events = buffer.split('\n\n')
    buffer = events.pop() ?? ''

    for (const raw of events) {
      const eventMatch = raw.match(/^event: (.+)$/m)
      const dataMatch = raw.match(/^data: (.+)$/m)
      if (!eventMatch || !dataMatch) continue
      const eventName = eventMatch[1]
      const data = JSON.parse(dataMatch[1])

      if (eventName === 'stage') {
        options.onStage?.(data.stage)
      } else if (eventName === 'done') {
        return data
      } else if (eventName === 'error') {
        throw new Error(
          typeof data.message === 'string' ? data.message : 'Submission failed',
        )
      }
    }
  }

  throw new Error('Submission ended without a result')
}

/**
 * POST /api/auth/:noteType/:id/send — streams SSE progress while submitting a note to ZATCA.
 *
 * @param {'credit-notes' | 'debit-notes'} noteType
 * @param {string} id
 * @param {{ signal?: AbortSignal, onStage?: (stage: string) => void }} [options]
 */
export async function authPostNoteSendStream(noteType, id, options = {}) {
  const res = await fetch(`/api/auth/${noteType}/${id}/send`, {
    method: 'POST',
    credentials: 'same-origin',
    signal: options.signal,
  })

  if (!res.ok || !res.body) {
    let data = {}
    try {
      data = await res.json()
    } catch {
      // ignore
    }
    const code =
      typeof data.code === 'string'
        ? data.code
        : res.status === 401
          ? 'UNAUTHORIZED'
          : res.status === 403
            ? 'FORBIDDEN'
            : res.status === 404
              ? 'NOT_FOUND'
              : res.status >= 500
                ? 'SERVER_ERROR'
                : undefined
    throw new AuthApiError(
      res.status,
      code,
      typeof data.message === 'string' ? data.message : undefined,
    )
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const parts = buffer.split('\n\n')
    buffer = parts.pop() ?? ''
    for (const part of parts) {
      const eventMatch = part.match(/^event: (.+)$/m)
      const dataMatch = part.match(/^data: (.+)$/m)
      if (!eventMatch || !dataMatch) continue
      const event = eventMatch[1]
      const data = JSON.parse(dataMatch[1])
      if (event === 'stage') options.onStage?.(data.stage)
      if (event === 'error') {
        throw new Error(typeof data.message === 'string' ? data.message : 'Submission failed')
      }
      if (event === 'done') return
    }
  }
}

export async function authPatch(path, body) {
  const res = await fetch(`/api/auth${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  let data = {}
  try {
    data = await res.json()
  } catch {
    // ignore
  }
  if (!res.ok) {
    const code =
      typeof data.code === 'string'
        ? data.code
        : res.status === 401
          ? 'UNAUTHORIZED'
          : res.status === 403
            ? 'FORBIDDEN'
            : res.status === 404
              ? 'NOT_FOUND'
              : res.status >= 500
                ? 'SERVER_ERROR'
                : undefined
    throw new AuthApiError(
      res.status,
      code,
      typeof data.message === 'string' ? data.message : undefined,
    )
  }
  return data
}

export async function authGet(path) {
  const res = await fetch(`/api/auth${path}`, {
    method: 'GET',
    credentials: 'same-origin',
  })
  let data = {}
  try {
    data = await res.json()
  } catch {
    // ignore
  }
  if (!res.ok) {
    const code =
      typeof data.code === 'string'
        ? data.code
        : res.status === 401
          ? 'UNAUTHORIZED'
          : res.status === 403
            ? 'FORBIDDEN'
            : res.status === 404
              ? 'NOT_FOUND'
              : res.status >= 500
                ? 'SERVER_ERROR'
                : undefined
    throw new AuthApiError(
      res.status,
      code,
      typeof data.message === 'string' ? data.message : undefined,
    )
  }
  return data
}

/**
 * GET binary (e.g. PDF) from /api/auth{path}. Returns Blob on success.
 * @param {string} path
 * @returns {Promise<{ blob: Blob, filename: string | null }>}
 */
export async function authGetBlob(path) {
  const res = await fetch(`/api/auth${path}`, {
    method: 'GET',
    credentials: 'same-origin',
  })
  if (!res.ok) {
    let data = {}
    try {
      data = await res.json()
    } catch {
      // ignore
    }
    const code =
      typeof data.code === 'string'
        ? data.code
        : res.status === 401
          ? 'UNAUTHORIZED'
          : res.status === 403
            ? 'FORBIDDEN'
            : res.status === 404
              ? 'NOT_FOUND'
              : res.status >= 500
                ? 'SERVER_ERROR'
                : undefined
    throw new AuthApiError(
      res.status,
      code,
      typeof data.message === 'string' ? data.message : undefined,
    )
  }
  const disposition = res.headers.get('Content-Disposition') || ''
  const match = /filename="([^"]+)"/i.exec(disposition)
  return {
    blob: await res.blob(),
    filename: match?.[1] ?? null,
  }
}

/**
 * @param {string} path e.g. "/clients/cuid" -> DELETE /api/auth/clients/cuid
 */
export async function authDelete(path) {
  const res = await fetch(`/api/auth${path}`, {
    method: 'DELETE',
    credentials: 'same-origin',
  })
  let data = {}
  try {
    data = await res.json()
  } catch {
    // ignore
  }
  if (!res.ok) {
    const code =
      typeof data.code === 'string'
        ? data.code
        : res.status === 401
          ? 'UNAUTHORIZED'
          : res.status === 403
            ? 'FORBIDDEN'
            : res.status === 404
              ? 'NOT_FOUND'
              : res.status >= 500
                ? 'SERVER_ERROR'
                : undefined
    throw new AuthApiError(
      res.status,
      code,
      typeof data.message === 'string' ? data.message : undefined,
    )
  }
  return data
}
