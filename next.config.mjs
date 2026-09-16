import { config as loadEnv } from 'dotenv'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import createNextIntlPlugin from 'next-intl/plugin'

const root = dirname(fileURLToPath(import.meta.url))
loadEnv({ path: resolve(root, '.env') })

const withNextIntl = createNextIntlPlugin('./src/i18n/request.js')

/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['node-thermal-printer'],
  transpilePackages: ['qz-tray'],
  // qz-tray@2.3 optionally require('lna') for Chrome Local Network Access.
  // The npm package is qz-lna, not "lna", so webpack fails unless we stub it.
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      lna: false,
    }
    return config
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
        pathname: '/**',
      },
    ],
  },
}

export default withNextIntl(nextConfig)
