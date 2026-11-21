import { createHash } from 'node:crypto'

/**
 * Security headers for hosts that read a `_headers` file (Cloudflare Pages). The build writes it
 * from the built index.html and the backend URL, so the policy always matches what ships: the
 * inline boot script is allowed by its SHA-256, never by 'unsafe-inline'.
 */

/** Contents of every inline `<script>` (no `src`) of an HTML document. */
export function inlineScripts(html: string): string[] {
  const found: string[] = []
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (!/\bsrc\s*=/i.test(match[1] ?? '')) found.push(match[2] ?? '')
  }
  return found
}

/**
 * CSP source expression for one inline script. The HTML parser turns CRLF and lone CR into LF
 * before the browser hashes the script, so a checkout with Windows line endings must hash the
 * same normalised text.
 */
export const scriptHash = (source: string) =>
  `'sha256-${createHash('sha256').update(source.replace(/\r\n?/g, '\n'), 'utf8').digest('base64')}'`

/** The browser origins the backend needs, from the public Supabase URL; none in demo builds. */
export function backendSources(backendUrl: string | undefined) {
  const raw = backendUrl?.trim()
  if (!raw) return { http: [] as string[], socket: [] as string[] }
  const url = new URL(raw)
  const secure = url.protocol === 'https:'
  return {
    http: [url.origin],
    socket: [`${secure ? 'wss' : 'ws'}://${url.host}`],
  }
}

export function contentSecurityPolicy({
  html,
  backendUrl,
}: {
  html: string
  backendUrl: string | undefined
}) {
  const backend = backendSources(backendUrl)
  const directives: Array<[string, string[]]> = [
    ['default-src', ["'self'"]],
    // The inline boot script (theme before first paint) is hashed; module scripts are 'self'.
    // 'wasm-unsafe-eval' is only for the 3D dice physics engine (WebAssembly), not for eval().
    // RYT-157: Cloudflare Turnstile (the bot check on email sign-in) loads its script and frame.
    [
      'script-src',
      [
        "'self'",
        ...inlineScripts(html).map(scriptHash),
        "'wasm-unsafe-eval'",
        'https://challenges.cloudflare.com',
      ],
    ],
    // Mantine injects its theme variables in <style> elements at runtime, which a static host
    // cannot nonce or hash. Styles cannot run code, so this is the one inline allowance.
    ['style-src', ["'self'", "'unsafe-inline'"]],
    // Signed Storage URLs (item, portrait, shop, creature and map images); blob: for previews.
    ['img-src', ["'self'", 'data:', 'blob:', ...backend.http]],
    // Tabletop ambience tracks are signed Storage URLs played by an audio element.
    ['media-src', ["'self'", ...backend.http]],
    ['font-src', ["'self'"]],
    [
      'connect-src',
      ["'self'", ...backend.http, ...backend.socket, 'https://challenges.cloudflare.com'],
    ],
    // The dice engine runs its physics in a worker it creates from a blob.
    ['worker-src', ["'self'", 'blob:']],
    ['frame-src', ['https://challenges.cloudflare.com']],
    ['manifest-src', ["'self'"]],
    ['object-src', ["'none'"]],
    ['base-uri', ["'self'"]],
    ['form-action', ["'self'"]],
    ['frame-ancestors', ["'none'"]],
  ]
  return directives.map(([name, sources]) => `${name} ${sources.join(' ')}`).join('; ')
}

const noCache = 'Cache-Control: no-cache'
// Static art is not content-hashed, so it cannot be immutable: a week of reuse, then the browser
// serves the cached copy while it revalidates in the background for another day.
const artCache = 'Cache-Control: public, max-age=604800, stale-while-revalidate=86400'

/**
 * The `_headers` file. Cloudflare merges every matching rule, so `Cache-Control` is never set on
 * `/*`: each path gets exactly one caching rule.
 */
export function headersFile(options: { html: string; backendUrl: string | undefined }) {
  const rules: Array<[string, string[]]> = [
    [
      '/*',
      [
        `Content-Security-Policy: ${contentSecurityPolicy(options)}`,
        'X-Content-Type-Options: nosniff',
        'X-Frame-Options: DENY',
        'Referrer-Policy: strict-origin-when-cross-origin',
        'Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()',
        'Strict-Transport-Security: max-age=31536000',
        // The Google sign-in is a full-page redirect, not a popup, so it is unaffected.
        'Cross-Origin-Opener-Policy: same-origin-allow-popups',
      ],
    ],
    ['/assets/*', ['Cache-Control: public, max-age=31536000, immutable']],
    ...['/art/*', '/bestiary/*', '/tabletop/*', '/icons/*', '/vendor/*'].map(
      (path): [string, string[]] => [path, [artCache]],
    ),
    ...['/', '/index.html', '/version.json', '/manifest.webmanifest', '/sw.js'].map(
      (path): [string, string[]] => [path, [noCache]],
    ),
  ]
  return `${rules.map(([path, lines]) => `${path}\n${lines.map((line) => `  ${line}`).join('\n')}`).join('\n\n')}\n`
}
