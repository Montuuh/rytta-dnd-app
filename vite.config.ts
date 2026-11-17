import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import { fileURLToPath, URL } from 'node:url'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseConfig } from './src/shared/lib/env-schema.ts'
import { headersFile } from './scripts/lib/security-headers.mts'

/**
 * Link previews need absolute image URLs. With VITE_SITE_URL (the public origin, no path) the
 * share image becomes absolute and og:url is added; without it the relative form stays.
 */
function absoluteShareUrls(siteUrl: string | undefined, base: string): Plugin {
  return {
    name: 'rytta-absolute-share-urls',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        const origin = siteUrl?.trim().replace(/\/+$/, '')
        if (!origin) return html
        return html
          .replace(
            /(<meta (?:property="og:image"|name="twitter:image") content=")(\/[^"]*)(")/g,
            `$1${origin}$2$3`,
          )
          .replace(
            '<meta property="og:type"',
            `<meta property="og:url" content="${origin}${base}" />
    <meta property="og:type"`,
          )
      },
    },
  }
}

/** RYT-117: one id per build, baked into the bundle and written to `version.json` beside index.html. */
function buildVersion(buildId: string): Plugin {
  let outDir = 'dist'
  return {
    name: 'rytta-build-version',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir)
    },
    closeBundle() {
      writeFileSync(
        resolve(outDir, 'version.json'),
        JSON.stringify({ id: buildId, builtAt: new Date().toISOString() }),
      )
    },
  }
}

/**
 * RYT-116: `_headers` for Cloudflare Pages (read from the site root). The policy is generated from
 * the built index.html, so the CSP carries the SHA-256 of the inline boot script, and from the
 * backend URL the build already uses, so only that origin is allowed for data, images and audio.
 */
function securityHeaders(backendUrl: string | undefined): Plugin {
  let outDir = 'dist'
  return {
    name: 'rytta-security-headers',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir)
    },
    closeBundle() {
      const html = readFileSync(resolve(outDir, 'index.html'), 'utf8')
      writeFileSync(resolve(outDir, '_headers'), headersFile({ html, backendUrl }))
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode, command }) => {
  const buildId = `${(process.env.GITHUB_SHA ?? '').slice(0, 12) || 'local'}-${Date.now().toString(36)}`
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  // Reject unsafe credentials before Vite can inline them into a public bundle.
  parseConfig(env)
  // RYT-115: after deleting an account the app tells users with a remaining sign-in record whom to
  // write to. Without a published address that step reads "pending": warn, do not fail (CI has none).
  const missing = ['VITE_CONTACT_EMAIL', 'VITE_OWNER_NAME'].filter((name) => !env[name]?.trim())
  if (mode === 'production' && missing.length)
    console.warn(
      [
        '',
        `[rytta] ${missing.join(' and ')} ${missing.length > 1 ? 'are' : 'is'} empty: the privacy policy shows the owner or contact as pending and`,
        '[rytta] the account-deletion notice cannot offer a contact. Set both before the public launch.',
        '',
      ].join('\n'),
    )
  return {
    plugins: [
      react(),
      buildVersion(buildId),
      securityHeaders(env.VITE_SUPABASE_URL),
      absoluteShareUrls(env.VITE_SITE_URL, env.VITE_BASE_PATH || '/'),
    ],
    define: { __APP_BUILD__: JSON.stringify(command === 'build' ? buildId : 'dev') },
    base: env.VITE_BASE_PATH || '/',
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    // RYT-008: each language's SRD glossary text is one lazy chunk (~0.5 MB, ~120 kB gzip),
    // loaded only when a definition is opened. App chunks stay far below this limit.
    build: {
      chunkSizeWarningLimit: 600,
      rollupOptions: {
        output: {
          // RYT-117: the interface catalogues are one lazy chunk per language; a stable name
          // tells them apart from the glossary and bestiary content chunks that are also en/es.
          chunkFileNames: (chunk) =>
            /\/shared\/i18n\/(en|es)\.ts$/.test(chunk.facadeModuleId ?? '')
              ? 'assets/catalogue-[name]-[hash].js'
              : 'assets/[name]-[hash].js',
        },
      },
    },
  }
})
