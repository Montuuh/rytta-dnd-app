#!/usr/bin/env node
// Image queue panel (docs/art-queue.md): `npm run art:queue`, then open http://127.0.0.1:5190.
// Local tool bound to 127.0.0.1, never imported by the app. The owner copies prompts, drops the
// downloaded PNG (saved at the request's path) and sees the checks; reviews happen in queue.mjs.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { dirname } from 'node:path'
import {
  MAX_ATTEMPTS,
  SETS,
  findRequest,
  loadQueue,
  markGenerated,
  safePath,
  saveQueue,
  summary,
} from './lib.mjs'

const port = Number(process.argv[process.argv.indexOf('--port') + 1]) || 5190
const MAX_UPLOAD = 60 * 1024 * 1024
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const panel = new URL('./panel.html', import.meta.url)

function send(response, status, body, type = 'application/json; charset=utf-8') {
  response.writeHead(status, {
    'Content-Type': type,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  })
  response.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body))
}

function readBody(request) {
  return new Promise((resolveBody, rejectBody) => {
    const chunks = []
    let size = 0
    request.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_UPLOAD) {
        rejectBody(new Error('The picture is larger than 60 MB'))
        request.destroy()
      } else chunks.push(chunk)
    })
    request.on('end', () => resolveBody(Buffer.concat(chunks)))
    request.on('error', rejectBody)
  })
}

function view(queue) {
  return {
    ...queue,
    summary: summary(queue),
    maxAttempts: MAX_ATTEMPTS,
    sets: Object.fromEntries(
      Object.entries(SETS).map(([key, set]) => [key, { folder: set.folder, note: set.note }]),
    ),
    requests: queue.requests.map((request) => ({
      ...request,
      hasFile: existsSync(safePath(request.path)),
    })),
  }
}

const server = createServer(async (request, response) => {
  try {
    // Only this machine's browser may call it: refuse other hosts and cross-site posts.
    const host = request.headers.host ?? ''
    if (!/^(127\.0\.0\.1|localhost):\d+$/.test(host))
      return send(response, 403, { error: 'Local only' })
    const origin = request.headers.origin
    if (request.method !== 'GET' && origin && origin !== `http://${host}`)
      return send(response, 403, { error: 'Cross-site' })

    const url = new URL(request.url, `http://${host}`)
    if (request.method === 'GET' && url.pathname === '/')
      return send(response, 200, readFileSync(panel), 'text/html; charset=utf-8')
    if (request.method === 'GET' && url.pathname === '/api/queue')
      return send(response, 200, view(loadQueue()))

    const image = /^\/api\/image\/(IMG-\d{3})$/.exec(url.pathname)
    if (request.method === 'GET' && image) {
      const path = safePath(findRequest(loadQueue(), image[1]).path)
      if (!existsSync(path)) return send(response, 404, { error: 'No picture yet' })
      return send(response, 200, readFileSync(path), 'image/png')
    }

    const action = /^\/api\/requests\/(IMG-\d{3})\/(upload|generated|pending)$/.exec(url.pathname)
    if (request.method === 'POST' && action) {
      const queue = loadQueue()
      const item = findRequest(queue, action[1])
      if (action[2] === 'upload') {
        const body = await readBody(request)
        if (!body.subarray(0, 8).equals(PNG))
          return send(response, 400, {
            error: 'No es un PNG. Descarga la imagen con el botón de ChatGPT.',
          })
        if (!['pending', 'generated', 'held'].includes(item.status))
          return send(response, 409, { error: `La solicitud está ${item.status}.` })
        const path = safePath(item.path)
        mkdirSync(dirname(path), { recursive: true })
        writeFileSync(path, body)
        markGenerated(item, 'panel')
      } else if (action[2] === 'generated') {
        if (!existsSync(safePath(item.path)))
          return send(response, 400, { error: `No hay ningún archivo en ${item.path}.` })
        markGenerated(item, 'saved by hand')
      } else {
        if (item.status !== 'generated')
          return send(response, 409, { error: `La solicitud está ${item.status}.` })
        item.attempts.pop()
        item.status = 'pending'
        item.updatedAt = new Date().toISOString()
      }
      saveQueue(queue)
      return send(response, 200, view(queue))
    }
    send(response, 404, { error: 'Not found' })
  } catch (error) {
    send(response, 500, { error: error.message })
  }
})

server.listen(port, '127.0.0.1', () => console.log(`Image queue panel: http://127.0.0.1:${port}`))
