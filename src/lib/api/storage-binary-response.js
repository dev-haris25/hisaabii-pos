/**
 * Returns image/file bytes from storage routes without triggering
 * "Response.clone: Body has already been consumed" in Next.js dev/proxy.
 *
 * @param {Buffer | Uint8Array} data
 * @param {{ contentType: string, status?: number, cacheControl?: string, headers?: Record<string, string> }} opts
 */
export function storageBinaryResponse(data, opts) {
  const source = data instanceof Uint8Array ? data : new Uint8Array(data)
  const body = new Uint8Array(source.byteLength)
  body.set(source)

  return new Response(new Blob([body], { type: opts.contentType }), {
    status: opts.status ?? 200,
    headers: {
      'Content-Type': opts.contentType,
      'Cache-Control': opts.cacheControl ?? 'private, no-store',
      ...opts.headers,
    },
  })
}
