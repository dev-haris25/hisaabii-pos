import {
  CharacterSet,
  PrinterTypes,
  ThermalPrinter,
} from 'node-thermal-printer'

/**
 * @param {import('node-thermal-printer').ThermalPrinter} p
 * @param {Record<string, unknown>} receipt
 */
export async function layoutReceipt(p, receipt) {
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
        '[escpos] logo print failed, falling back to name:',
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
  const copyLabel =
    typeof receipt.copyLabel === 'string' ? receipt.copyLabel.trim() : ''
  if (copyLabel) {
    p.drawLine()
    p.alignCenter()
    p.println(copyLabel)
  }
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
  const orderNumber = Number(receipt.orderNumber)
  if (Number.isFinite(orderNumber) && orderNumber > 0) {
    p.println(`Order: ORD-${String(Math.trunc(orderNumber)).padStart(4, '0')}`)
  }
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
    const extras = Array.isArray(line?.details) ? line.details : []
    for (const extra of extras) {
      const text = String(extra ?? '').trim()
      if (text) p.println(`  ${text.slice(0, 30)}`)
    }
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
 * ESC/POS bytes for native desktop print (no TCP send).
 *
 * @param {Record<string, unknown>} receipt
 * @returns {Promise<Buffer>}
 */
export async function buildEscposBuffer(receipt) {
  const printer = new ThermalPrinter({
    type: PrinterTypes.EPSON,
    interface: 'tcp://127.0.0.1:9100',
    characterSet: CharacterSet.PC437_USA,
    removeSpecialCharacters: false,
    lineCharacter: '-',
    options: { timeout: 8000 },
  })
  await layoutReceipt(printer, receipt)
  return printer.getBuffer()
}
