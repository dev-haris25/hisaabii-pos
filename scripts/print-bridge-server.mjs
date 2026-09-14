import 'dotenv/config'
import { mkdirSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { join } from 'node:path'

import {
  CharacterSet,
  PrinterTypes,
  ThermalPrinter,
} from 'node-thermal-printer'

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
 * @param {import('node-thermal-printer').ThermalPrinter} p
 * @param {Record<string, unknown>} receipt
 */
async function layoutReceipt(p, receipt) {
  const restaurantName = String(receipt.restaurantName || 'Hisabi POS')
  const invoiceNumber = String(receipt.invoiceNumber || '')
  const qrCode = String(receipt.qrCode || '').trim()
  const logoB64 =
    typeof receipt.logoPngBase64 === 'string'
      ? receipt.logoPngBase64.trim()
      : ''

  p.alignCenter()
  let printedLogo = false
  if (logoB64) {
    try {
      await p.printImageBuffer(Buffer.from(logoB64, 'base64'))
      p.newLine()
      printedLogo = true
    } catch (err) {
      console.warn(
        '[print-bridge] logo print failed, falling back to name:',
        err instanceof Error ? err.message : String(err),
      )
    }
  }
  if (!printedLogo) {
    p.setTextDoubleHeight()
    p.println(restaurantName)
    p.setTextNormal()
  }
  if (receipt.vatNumber) p.println(`VAT: ${receipt.vatNumber}`)
  if (receipt.crNumber) p.println(`CR: ${receipt.crNumber}`)
  p.drawLine()
  p.alignLeft()
  const documentLabel =
    typeof receipt.documentLabel === 'string' ? receipt.documentLabel.trim() : ''
  if (documentLabel) {
    p.setTextDoubleHeight()
    p.println(documentLabel)
    p.setTextNormal()
  }
  p.println(`${documentLabel ? 'Note' : 'Invoice'}: ${invoiceNumber}`)
  if (receipt.referenceInvoiceNumber) {
    p.println(`Ref: ${receipt.referenceInvoiceNumber}`)
  }
  if (receipt.reason) {
    p.println(`Reason: ${String(receipt.reason).slice(0, 60)}`)
  }
  if (receipt.invoiceDate) p.println(`Date: ${receipt.invoiceDate}`)
  if (receipt.staffName) p.println(`Cashier: ${receipt.staffName}`)
  p.drawLine()

  const lines = Array.isArray(receipt.lines) ? receipt.lines : []
  for (const line of lines) {
    const name = String(line?.name || '').slice(0, 28)
    const qty = String(line?.quantity ?? '')
    const total = String(line?.lineTotal ?? '')
    p.println(name)
    p.println(`  ${qty} x ${line?.unitPrice ?? ''}  ${total}`)
  }
  p.drawLine()
  p.println(`Subtotal: ${receipt.subtotal ?? ''}`)
  if (receipt.discount && String(receipt.discount) !== '0.00') {
    p.println(`Discount: -${receipt.discount}`)
  }
  p.println(`VAT: ${receipt.totalVat ?? ''}`)
  p.setTextDoubleHeight()
  p.println(`TOTAL: ${receipt.grandTotal ?? ''}`)
  p.setTextNormal()
  if (receipt.paymentMethod) {
    p.println(`Payment: ${receipt.paymentMethod}`)
    if (receipt.paymentMethod === 'cash') {
      if (receipt.amountTendered) p.println(`Received: ${receipt.amountTendered}`)
      if (receipt.changeGiven) p.println(`Change: ${receipt.changeGiven}`)
    }
  }
  p.drawLine()
  p.alignCenter()
  p.printQR(qrCode, {
    cellSize: 6,
    correction: 'M',
    model: 2,
  })
  p.newLine()
  p.println('Thank you')
  const phone = typeof receipt.sellerPhone === 'string' ? receipt.sellerPhone.trim() : ''
  const email = typeof receipt.sellerEmail === 'string' ? receipt.sellerEmail.trim() : ''
  if (phone) p.println(phone)
  if (email) p.println(email)
  p.cut()
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
