// Serves a built folder the way Cloudflare Pages does: the headers come from its `_headers` file.
// Used by the security-headers e2e spec; also handy to look at a production build locally:
//   node scripts/serve-with-headers.mjs dist-headers 4175
// Supports the subset of the format Rytta emits: a path line (with `*` as a splat), then indented
// `Name: value` lines. Every matching rule applies; repeated names are joined with ", ", as on
// Cloudflare.
// Like Pages without a top-level 404.html (RYT-186), an unknown path gets index.html with 200, and
// a folder path without its trailing slash is redirected to it (/privacy -> /privacy/).
import { createReadStream, readFileSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize, resolve, sep } from 'node:path'

const [directory = 'dist', port = '4175'] = process.argv.slice(2)
const root = resolve(directory)

function parseHeaders(text) {
  const rules = []
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue
    if (/^\s/.test(line)) {
      const colon = line.indexOf(':')
      rules.at(-1)?.headers.push([line.slice(0, colon).trim(), line.slice(colon + 1).trim()])
    } else {
      const escaped = line.trim().replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      rules.push({ pattern: new RegExp(`^${escaped.replaceAll('*', '.*')}$`), headers: [] })
    }
  }
  return rules
}

const spaFallback = !statSync(join(root, '404.html'), { throwIfNoEntry: false })
const rules = parseHeaders(readFileSync(join(root, '_headers'), 'utf8'))
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.wasm': 'application/wasm',
  '.mp3': 'audio/mpeg',
}

createServer((request, response) => {
  const path = decodeURIComponent(new URL(request.url ?? '/', 'http://x').pathname)
  const file = normalize(join(root, path.endsWith('/') ? `${path}index.html` : path))
  const known = file.startsWith(root + sep) || file === root
  let found = known && statSync(file, { throwIfNoEntry: false })?.isFile()
  if (!found && known && statSync(join(file, 'index.html'), { throwIfNoEntry: false })?.isFile()) {
    response.statusCode = 308
    response.setHeader('Location', `${path}/`)
    response.end()
    return
  }
  const merged = new Map()
  for (const rule of rules)
    if (rule.pattern.test(path))
      for (const [name, value] of rule.headers) {
        const key = name.toLowerCase()
        merged.set(key, merged.has(key) ? `${merged.get(key)}, ${value}` : value)
      }
  for (const [name, value] of merged) response.setHeader(name, value)
  const served = found ? file : known && spaFallback ? join(root, 'index.html') : null
  if (!served) {
    response.statusCode = 404
    response.end('Not found')
    return
  }
  response.setHeader('Content-Type', types[extname(served)] ?? 'application/octet-stream')
  response.setHeader('Content-Length', statSync(served).size)
  createReadStream(served).pipe(response)
}).listen(Number(port), '127.0.0.1', () => console.log(`Serving ${root} on :${port}`))
