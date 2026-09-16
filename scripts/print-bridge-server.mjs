import 'dotenv/config'
import { mkdirSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { join } from 'node:path'

import {
  CharacterSet,
  PrinterTypes,
  ThermalPrinter,
} from 'node-thermal-printer'

import { layoutReceipt } from '../src/lib/print/build-escpos-buffer.js'

const PORT = Number(process.env.PRINT_BRIDGE_PORT || 3910)
const SECRET = (process.env.PRINT_BRIDGE_SECRET || '').trim()
const DRY_RUN_DEFAULT =
  process.env.PRINT_BRIDGE_DRY_RUN === 'true' ||
  process.env.PRINT_BRIDGE_DRY_RUN === '1'
const DRY_RUN_DIR =
  process.env.PRINT_BRIDGE_DRY_RUN_DIR?.trim() ||
  join(process.cwd(), 'tmp', 'print-dry-run')

/**
 * @param {import('node:http').IncomingMessage} req
 * @returns {Promise<unknown>}
 */
function readJson(req) {
  return new Promise((resolve, reject) => {
    /** @type {Buffer[]} */
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8')
        resolve(raw ? JSON.parse(raw) : {})
      } catch (err) {
        reject(err)
      }
    })
    req.on('error', reject)
  })
}

/**
 * @param {import('node:http').ServerResponse} res
 * @param {number} status
 * @param {Record<string, unknown>} body
 */
function json(res, status, body) {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
  })
  res.end(payload)
}

/** @param {unknown} authHeader */
function authorize(authHeader) {
  if (!SECRET) return true
  if (typeof authHeader !== 'string') return false
  const m = /^Bearer\s+(.+)$/i.exec(authHeader.trim())
  return Boolean(m && m[1].trim() === SECRET)
}

/**
 * @param {Record<string, unknown>} body
 */
async function handlePrint(body) {
  const receipt =
    body && typeof body === 'object' && body.receipt && typeof body.receipt === 'object'
      ? /** @type {Record<string, unknown>} */ (body.receipt)
      : null
  if (!receipt) {
    return {
      status: 400,
      body: { ok: false, code: 'INVALID_RECEIPT', message: 'receipt required' },
    }
  }

  const qrCode = String(receipt.qrCode || '').trim()
  if (!qrCode || qrCode.length < 32) {
    return {
      status: 400,
      body: {
        ok: false,
        code: 'QR_REQUIRED',
        message: 'Phase-2 QR is required before printing',
      },
    }
  }

  const dryRun =
    body.dryRun === true || body.dryRun === 'true' || DRY_RUN_DEFAULT

  const printerRaw =
    body.printer && typeof body.printer === 'object'
      ? /** @type {Record<string, unknown>} */ (body.printer)
      : {}
  const ip = String(printerRaw.ip || '127.0.0.1').trim() || '127.0.0.1'
  const portNum = Number(printerRaw.port ?? 9100)
  const port = Number.isFinite(portNum) && portNum > 0 ? portNum : 9100

  if (!dryRun && (!printerRaw.ip || !String(printerRaw.ip).trim())) {
    return {
      status: 400,
      body: {
        ok: false,
        code: 'PRINTER_NOT_CONFIGURED',
        message: 'Printer IP is required when dry-run is off',
      },
    }
  }

  const printer = new ThermalPrinter({
    type: PrinterTypes.EPSON,
    interface: `tcp://${ip}:${port}`,
    characterSet: CharacterSet.PC437_USA,
    removeSpecialCharacters: false,
    lineCharacter: '-',
    options: { timeout: 8000 },
  })

  await layoutReceipt(printer, receipt)
  const buffer = printer.getBuffer()

  if (dryRun) {
    mkdirSync(DRY_RUN_DIR, { recursive: true })
    const invoiceNumber = String(receipt.invoiceNumber || 'unknown').replace(
      /[^\w.-]+/g,
      '_',
    )
    const fileName = `receipt-${invoiceNumber}-${Date.now()}.bin`
    const filePath = join(DRY_RUN_DIR, fileName)
    writeFileSync(filePath, buffer)
    console.info(
      `[print-bridge] DRY-RUN wrote ${buffer.length} bytes → ${filePath}`,
    )
    return {
      status: 200,
      body: {
        ok: true,
        dryRun: true,
        bytes: buffer.length,
        dryRunPath: filePath,
      },
    }
  }

  await printer.execute()
  console.info(`[print-bridge] printed ${buffer.length} bytes to ${ip}:${port}`)
  return {
    status: 200,
    body: { ok: true, dryRun: false, bytes: buffer.length },
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)

  if (req.method === 'GET' && url.pathname === '/health') {
    json(res, 200, {
      ok: true,
      dryRunDefault: DRY_RUN_DEFAULT,
      dryRunDir: DRY_RUN_DIR,
    })
    return
  }

  if (req.method === 'POST' && url.pathname === '/print') {
    if (!authorize(req.headers.authorization)) {
      json(res, 401, {
        ok: false,
        code: 'UNAUTHORIZED',
        message: 'Invalid bridge secret',
      })
      return
    }
    try {
      const body = await readJson(req)
      const result = await handlePrint(
        /** @type {Record<string, unknown>} */ (body),
      )
      json(res, result.status, result.body)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('[print-bridge] print failed:', message)
      json(res, 502, {
        ok: false,
        code: 'PRINT_FAILED',
        message: 'Could not print receipt',
      })
    }
    return
  }

  json(res, 404, { ok: false, code: 'NOT_FOUND', message: 'Not found' })
})

server.listen(PORT, '127.0.0.1', () => {
  console.info(`[print-bridge] listening on http://127.0.0.1:${PORT}`)
  console.info(
    `[print-bridge] dry-run default=${DRY_RUN_DEFAULT} dir=${DRY_RUN_DIR}`,
  )
  if (!SECRET) {
    console.warn(
      '[print-bridge] PRINT_BRIDGE_SECRET is empty — requests are unauthenticated (dev only)',
    )
  }
})
