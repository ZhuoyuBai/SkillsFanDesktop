import { resolve } from 'path'
import { readFileSync, existsSync } from 'fs'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

/**
 * Load environment variables from .env.local
 * These will be injected at build time via `define`
 */
function loadEnvLocal(): Record<string, string> {
  const envPath = resolve(__dirname, '.env.local')
  const env: Record<string, string> = {}

  if (existsSync(envPath)) {
    const content = readFileSync(envPath, 'utf-8')
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      // Skip empty lines and comments
      if (!trimmed || trimmed.startsWith('#')) continue

      const eqIndex = trimmed.indexOf('=')
      if (eqIndex > 0) {
        const key = trimmed.slice(0, eqIndex).trim()
        let value = trimmed.slice(eqIndex + 1).trim()
        // Remove surrounding quotes if present
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1)
        }
        env[key] = value
      }
    }
  }

  return env
}

const envLocal = loadEnvLocal()

/**
 * Build-time injected analytics config
 * In open-source builds without .env.local, these will be empty strings (analytics disabled)
 */
const analyticsDefine = {
  '__HALO_GA_MEASUREMENT_ID__': JSON.stringify(envLocal.HALO_GA_MEASUREMENT_ID || ''),
  '__HALO_GA_API_SECRET__': JSON.stringify(envLocal.HALO_GA_API_SECRET || ''),
  '__HALO_BAIDU_SITE_ID__': JSON.stringify(envLocal.HALO_BAIDU_SITE_ID || ''),
}

/**
 * Build-time region config
 * Set via: cross-env SKILLSFAN_REGION=cn npm run build
 * Empty string means "auto-detect at runtime via locale"
 */
const regionDefine = {
  '__SKILLSFAN_REGION__': JSON.stringify(process.env.SKILLSFAN_REGION || ''),
  '__SKILLSFAN_API_URL__': JSON.stringify(process.env.SKILLSFAN_API_URL || ''),
}

const sharedAliases = {
  '@main': resolve(__dirname, 'src/main'),
  '@shared': resolve(__dirname, 'src/shared')
}

export default defineConfig({
  main: {
    plugins: [
      externalizeDepsPlugin()
    ],
    define: { ...analyticsDefine, ...regionDefine },
    resolve: {
      alias: sharedAliases
    },
    build: {
      sourcemap: true,
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts')
        },
        output: {
          format: 'es',
          entryFileNames: '[name].mjs'
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: sharedAliases
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.ts')
        },
        output: {
          format: 'es',
          entryFileNames: '[name].mjs'
        }
      }
    }
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    define: regionDefine,
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html'),
          overlay: resolve(__dirname, 'src/renderer/overlay.html')
        },
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined

            if (
              id.includes('/react/') ||
              id.includes('/react-dom/') ||
              id.includes('/zustand/') ||
              id.includes('/i18next/') ||
              id.includes('/react-i18next/')
            ) {
              return 'vendor-react'
            }

            if (
              id.includes('/react-markdown/') ||
              id.includes('/remark-gfm/') ||
              id.includes('/rehype-highlight/') ||
              id.includes('/rehype-raw/') ||
              id.includes('/streamdown/') ||
              id.includes('/@streamdown/')
            ) {
              return 'vendor-markdown'
            }

            if (id.includes('/highlight.js/')) {
              return 'vendor-highlight'
            }

            if (
              id.includes('/xlsx/') ||
              id.includes('/mammoth/') ||
              id.includes('/qrcode/')
            ) {
              return 'vendor-data'
            }

            if (id.includes('/lucide-react/')) {
              return 'vendor-ui'
            }

            return undefined
          }
        }
      }
    },
    plugins: [react()],
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src/renderer'),
        ...sharedAliases
      }
    }
  }
})
