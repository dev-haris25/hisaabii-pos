import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { transformWithEsbuild } from 'vite'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '../..')
const srcRoot = resolve(repoRoot, 'src')

/** Treat Hisabi src JS files that contain JSX as JSX (Next.js convention). */
function jsxInJsPlugin() {
  return {
    name: 'jsx-in-js',
    async transform(code, id) {
      if (!id.includes(`${srcRoot.replace(/\\/g, '/')}`) && !id.includes(srcRoot)) {
        // Windows path variants
        if (!/[\\/]src[\\/].+\.js$/.test(id) || id.includes('node_modules')) {
          return null
        }
        if (!id.endsWith('.js')) return null
        // only transform if it looks like JSX
        if (!code.includes('<') || !/<\/?[A-Za-z]/.test(code)) return null
      } else if (!id.endsWith('.js') || id.includes('node_modules')) {
        return null
      } else if (!code.includes('<') || !/<\/?[A-Za-z]/.test(code)) {
        return null
      }

      return transformWithEsbuild(code, id, {
        loader: 'jsx',
        jsx: 'automatic',
      })
    },
  }
}

export default defineConfig({
  base: './',
  plugins: [jsxInJsPlugin(), react(), tailwindcss()],
  root: __dirname,
  resolve: {
    alias: [
      {
        find: '@/i18n/navigation',
        replacement: resolve(__dirname, 'src/shims/i18n-navigation.jsx'),
      },
      { find: 'next/image', replacement: resolve(__dirname, 'src/shims/next-image.jsx') },
      {
        find: 'next/navigation',
        replacement: resolve(__dirname, 'src/shims/next-navigation.js'),
      },
      { find: 'next/link', replacement: resolve(__dirname, 'src/shims/next-link.jsx') },
      { find: '@', replacement: srcRoot },
    ],
    dedupe: ['react', 'react-dom', 'next-intl'],
  },
  optimizeDeps: {
    esbuildOptions: {
      loader: {
        '.js': 'jsx',
      },
    },
    include: [
      'react',
      'react-dom',
      'next-intl',
      '@tanstack/react-query',
      'lucide-react',
      'sonner',
      'zustand',
      'clsx',
      'tailwind-merge',
    ],
  },
  server: {
    fs: {
      allow: [repoRoot, __dirname],
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    commonjsOptions: {
      include: [/node_modules/],
    },
  },
})
