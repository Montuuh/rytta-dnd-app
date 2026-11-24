import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  backendSources,
  contentSecurityPolicy,
  headersFile,
  inlineScripts,
} from '../../scripts/lib/security-headers.mts'

const html = `<html><head>
<script>try { document.title = "x" } catch {}</script>
<script type="module" crossorigin src="/assets/index-abc.js"></script>
</head></html>`

describe('security headers', () => {
  it('finds inline scripts only, not external ones', () => {
    expect(inlineScripts(html)).toEqual(['try { document.title = "x" } catch {}'])
  })

  it('hashes the inline script and never allows unsafe-inline for scripts', () => {
    const hash = createHash('sha256')
      .update('try { document.title = "x" } catch {}')
      .digest('base64')
    const csp = contentSecurityPolicy({ html, backendUrl: undefined })
    const script = csp.split('; ').find((d) => d.startsWith('script-src '))
    expect(script).toContain(`'sha256-${hash}'`)
    expect(script).not.toContain('unsafe-inline')
    expect(script).not.toContain("'unsafe-eval'")
  })

  it('allows only the configured backend over https and wss', () => {
    expect(backendSources('https://abc.supabase.co/')).toEqual({
      http: ['https://abc.supabase.co'],
      socket: ['wss://abc.supabase.co'],
    })
    const csp = contentSecurityPolicy({ html, backendUrl: 'https://abc.supabase.co' })
    expect(csp).toContain(
      "connect-src 'self' https://abc.supabase.co wss://abc.supabase.co https://challenges.cloudflare.com",
    )
    // RYT-157: the Turnstile bot check is the only other script and frame origin.
    expect(csp).toContain('frame-src https://challenges.cloudflare.com')
    expect(csp).toMatch(/script-src [^;]*https:\/\/challenges\.cloudflare\.com/)
    expect(csp).toContain("img-src 'self' data: blob: https://abc.supabase.co")
    const demo = contentSecurityPolicy({ html, backendUrl: '' })
    expect(demo).toContain("connect-src 'self' https://challenges.cloudflare.com;")
    expect(demo).not.toContain('supabase')
  })

  it('forbids framing, plugins and foreign form posts', () => {
    const csp = contentSecurityPolicy({ html, backendUrl: undefined })
    for (const rule of [
      "frame-ancestors 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ])
      expect(csp).toContain(rule)
  })

  it('gives every path one caching rule and none on the catch-all', () => {
    const file = headersFile({ html, backendUrl: undefined })
    const blocks = file.trim().split('\n\n')
    const catchAll = blocks.find((block) => block.startsWith('/*\n'))
    expect(catchAll).not.toMatch(/Cache-Control/i)
    expect(blocks.find((block) => block.startsWith('/assets/*'))).toContain('immutable')
    for (const path of ['/art/*', '/bestiary/*', '/tabletop/*', '/icons/*', '/vendor/*'])
      expect(blocks.find((block) => block.startsWith(`${path}\n`))).not.toContain('immutable')
    for (const path of ['/', '/index.html', '/version.json', '/manifest.webmanifest', '/sw.js'])
      expect(blocks.find((block) => block.startsWith(`${path}\n`))).toContain('no-cache')
  })
})
