import { existsSync } from 'node:fs'
import puppeteer from 'puppeteer'

/** @returns {import('puppeteer').LaunchOptions} */
export function puppeteerLaunchOptions() {
  const args = ['--no-sandbox', '--disable-setuid-sandbox']
  const opts = /** @type {import('puppeteer').LaunchOptions} */ ({ headless: true, args })

  const fromEnv = process.env.PUPPETEER_EXECUTABLE_PATH?.trim()
  if (fromEnv && existsSync(fromEnv)) {
    opts.executablePath = fromEnv
    return opts
  }

  if (process.platform === 'win32') {
    const candidates = [
      process.env.PROGRAMFILES
        ? `${process.env.PROGRAMFILES}\\Google\\Chrome\\Application\\chrome.exe`
        : null,
      process.env['PROGRAMFILES(X86)']
        ? `${process.env['PROGRAMFILES(X86)']}\\Google\\Chrome\\Application\\chrome.exe`
        : null,
      process.env.LOCALAPPDATA
        ? `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`
        : null,
    ].filter(Boolean)
    const found = candidates.find((path) => existsSync(path))
    if (found) opts.executablePath = found
  }

  return opts
}

/** @param {string} voucherNumber */
export function safePdfFilename(voucherNumber) {
  const base = String(voucherNumber ?? 'salary-slip').replace(/[^\w.-]+/g, '_')
  return base || 'salary-slip'
}

/**
 * @param {{ salarySlipId: string, locale: string, origin: string, cookieHeader?: string }} p
 * @returns {Promise<Buffer>}
 */
export async function generateSalarySlipPdfBuffer({
  salarySlipId,
  locale,
  origin,
  cookieHeader,
}) {
  const printUrl = `${origin}/${locale}/print/salary-slip/${salarySlipId}`
  let browser
  try {
    browser = await puppeteer.launch(puppeteerLaunchOptions())
    const page = await browser.newPage()
    await page.setViewport({ width: 1000, height: 1414, deviceScaleFactor: 2 })
    if (cookieHeader) await page.setExtraHTTPHeaders({ Cookie: cookieHeader })

    await page.goto(printUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.waitForFunction(
      () =>
        document.querySelector('[data-salary-slip-print-root]')?.dataset
          .printReady === 'true',
      { timeout: 15000 },
    )

    return Buffer.from(
      await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '0', bottom: '0', left: '0', right: '0' },
        scale: 0.75,
        preferCSSPageSize: false,
      }),
    )
  } finally {
    if (browser) await browser.close()
  }
}
