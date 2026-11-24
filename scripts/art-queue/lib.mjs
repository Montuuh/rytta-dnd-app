// Image queue (docs/art-queue.md): requests for pictures the owner paints by hand in ChatGPT.
// Local tool shared by queue.mjs and server.mjs; never imported by the app.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
export const QUEUE_FILE = resolve(ROOT, process.env.ART_QUEUE_FILE ?? 'art/queue/requests.json')
export const MAX_ATTEMPTS = 3

// Every status a request can have, in the order the panel shows them.
// pending: waiting for the owner to generate it. generated: saved at its path, waiting for review.
// approved: reviewed, waiting for its import. imported: shipped. held: rejected MAX_ATTEMPTS times,
// waits for the owner's decision. cancelled: no longer needed.
export const STATUSES = ['pending', 'generated', 'approved', 'imported', 'held', 'cancelled']

// Where each set saves its sources and how it is imported. `import` is the command that turns the
// sources into the shipped files; null means the request's ticket wires the picture by hand.
export const SETS = {
  bestiary: {
    folder: 'art/bestiary/source',
    aspect: '1:1',
    minSide: 512,
    background: 'opaque',
    crop: false,
    import: ['python', '-I', 'scripts/bestiary/import_art.py'],
    note: 'File name: the SRD creature id. The catalogue is rewritten by the import.',
  },
  sprites: {
    folder: 'art/sprites/source',
    aspect: '1:1',
    minSide: 1024,
    background: 'transparent',
    crop: false,
    import: ['python', 'scripts/sprites/import_sheets.py'],
    note: 'A new sheet also needs its row in scripts/sprites/catalogue.py (layout, footprint).',
  },
  interface: {
    folder: 'art/generated',
    aspect: '16:9',
    minSide: 720,
    background: 'opaque',
    crop: true,
    import: ['python', 'scripts/art-gen/build.py'],
    note: 'Sub-folder per set (brand, covers, shops, classes, items, empty, scenes); see docs/interface-art.md.',
  },
  other: {
    folder: 'art/queue/source',
    aspect: '1:1',
    minSide: 1024,
    background: 'opaque',
    crop: false,
    import: null,
    note: 'Wired by hand in the request ticket.',
  },
}

const ASPECTS = ['1:1', '3:2', '2:3', '16:9', '9:16', '4:3', '3:4']
// Prompts never borrow a style (docs/interface-art.md, docs/sprite-art.md).
const BORROWED_STYLE =
  /\b(in the style of|style of|by artist|studio ghibli|pixar|disney|forgotten adventures|czepeku|dungeon alchemist|artstation)\b/i

export function now() {
  return new Date().toISOString()
}

export function loadQueue() {
  if (!existsSync(QUEUE_FILE))
    return { schemaVersion: 1, updatedAt: null, batches: [], requests: [] }
  return JSON.parse(readFileSync(QUEUE_FILE, 'utf8'))
}

export function saveQueue(queue) {
  queue.updatedAt = now()
  mkdirSync(dirname(QUEUE_FILE), { recursive: true })
  const temporary = `${QUEUE_FILE}.tmp`
  writeFileSync(temporary, `${JSON.stringify(queue, null, 2)}\n`)
  renameSync(temporary, QUEUE_FILE)
}

export function findRequest(queue, id) {
  const request = queue.requests.find((item) => item.id === id)
  if (!request) throw new Error(`No request ${id}`)
  return request
}

// Resolves a request path inside the repository; anything outside it is refused.
export function safePath(path) {
  const absolute = resolve(ROOT, path)
  const inside = relative(ROOT, absolute)
  if (!inside || inside.startsWith('..') || isAbsolute(inside))
    throw new Error(`Path outside the repository: ${path}`)
  if (!/\.png$/i.test(absolute)) throw new Error(`The source must be a .png: ${path}`)
  return absolute
}

function nextId(queue) {
  const last = queue.requests.reduce((max, item) => Math.max(max, Number(item.id.slice(4))), 0)
  return `IMG-${String(last + 1).padStart(3, '0')}`
}

function requireText(value, name, id) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${id}: ${name} is required`)
  return value.trim()
}

// Adds batches and requests; returns the new ids. Input: { batches?: [], requests: [] }.
export function addRequests(queue, input) {
  const added = []
  for (const batch of input.batches ?? []) {
    requireText(batch.id, 'batch id', 'batch')
    if (queue.batches.some((item) => item.id === batch.id))
      throw new Error(`Batch ${batch.id} exists`)
    queue.batches.push({
      id: batch.id,
      title: requireText(batch.title, 'title', batch.id),
      style: requireText(batch.style, 'style', batch.id),
      notes: batch.notes ?? '',
      createdAt: now(),
    })
  }
  for (const raw of input.requests ?? []) {
    const id = nextId(queue)
    const set = SETS[raw.set] ? raw.set : null
    if (!set)
      throw new Error(`${raw.title ?? id}: set must be one of ${Object.keys(SETS).join(', ')}`)
    const defaults = SETS[set]
    const prompt = requireText(raw.prompt, 'prompt', id)
    if (BORROWED_STYLE.test(prompt))
      throw new Error(`${id}: the prompt borrows a style (${prompt.match(BORROWED_STYLE)[0]})`)
    if (raw.batch && !queue.batches.some((item) => item.id === raw.batch))
      throw new Error(`${id}: no batch ${raw.batch}`)
    const aspect = raw.aspect ?? defaults.aspect
    if (!ASPECTS.includes(aspect))
      throw new Error(`${id}: aspect must be one of ${ASPECTS.join(', ')}`)
    const path = requireText(raw.path, 'path', id).replaceAll('\\', '/')
    safePath(path)
    if (
      queue.requests.some(
        (item) => item.path === path && !['imported', 'cancelled'].includes(item.status),
      )
    )
      throw new Error(`${id}: another open request saves to ${path}`)
    const acceptance = raw.acceptance ?? []
    if (!Array.isArray(acceptance) || !acceptance.length)
      throw new Error(`${id}: acceptance needs at least one criterion`)
    queue.requests.push({
      id,
      title: requireText(raw.title, 'title', id),
      set,
      ticket: raw.ticket ?? null,
      batch: raw.batch ?? null,
      purpose: requireText(raw.purpose, 'purpose', id),
      status: 'pending',
      prompt,
      aspect,
      minSide: raw.minSide ?? defaults.minSide,
      background: raw.background ?? defaults.background,
      crop: raw.crop ?? defaults.crop,
      path,
      acceptance,
      notes: raw.notes ?? '',
      createdAt: now(),
      updatedAt: now(),
      attempts: [],
    })
    added.push(id)
  }
  return added
}

// Runs the automatic checks (inspect.py) on the file at the request's path.
export function inspect(request) {
  const args = [
    '-I',
    resolve(ROOT, 'scripts/art-queue/inspect.py'),
    safePath(request.path),
    '--aspect',
    request.aspect,
    '--min-side',
    String(request.minSide),
    '--background',
    request.background,
  ]
  if (request.crop) args.push('--crop')
  return JSON.parse(execFileSync('python', args, { cwd: ROOT, encoding: 'utf8' }))
}

export function failing(result) {
  return (result?.checks ?? []).filter((check) => check.level === 'fail')
}

// The owner saved a picture at the path (from the panel or by hand): record the attempt and check it.
export function markGenerated(request, source) {
  if (!['pending', 'generated', 'held'].includes(request.status))
    throw new Error(`${request.id} is ${request.status}; only pending requests take a picture`)
  const result = inspect(request)
  const attempt = {
    n: request.attempts.filter((item) => item.savedAt).length + 1,
    prompt: request.prompt,
    savedAt: now(),
    source,
    sha256: result.sha256 ?? null,
    width: result.width ?? null,
    height: result.height ?? null,
    provenance: result.provenance ?? null,
    checks: result.checks,
    review: null,
  }
  const last = request.attempts.at(-1)
  if (last && !last.review) request.attempts[request.attempts.length - 1] = attempt
  else request.attempts.push(attempt)
  request.status = 'generated'
  request.updatedAt = now()
  return attempt
}

export function currentAttempt(request) {
  const last = request.attempts.at(-1)
  if (!last || last.review) throw new Error(`${request.id} has no picture waiting for review`)
  return last
}

export function approve(request, note) {
  if (request.status !== 'generated')
    throw new Error(`${request.id} is ${request.status}, not generated`)
  const attempt = currentAttempt(request)
  const fresh = inspect(request)
  if (fresh.sha256 !== attempt.sha256)
    throw new Error(`${request.id}: the file changed since it was marked; mark it again`)
  const blocking = failing(fresh)
  if (blocking.length)
    throw new Error(
      `${request.id}: automatic checks fail: ${blocking.map((c) => c.message).join(' ')}`,
    )
  attempt.review = { verdict: 'approved', reason: note ?? '', at: now() }
  request.status = 'approved'
  request.updatedAt = now()
}

// A rejected picture goes back to pending with a corrected prompt, or waits for the owner after
// MAX_ATTEMPTS rejections.
export function reject(request, reason, prompt) {
  if (!['generated', 'approved'].includes(request.status))
    throw new Error(`${request.id} is ${request.status}`)
  const attempt = currentAttempt(request)
  attempt.review = {
    verdict: 'rejected',
    reason: requireText(reason, 'reason', request.id),
    at: now(),
  }
  const rejected = request.attempts.filter((item) => item.review?.verdict === 'rejected').length
  if (prompt) {
    if (BORROWED_STYLE.test(prompt)) throw new Error(`${request.id}: the prompt borrows a style`)
    request.prompt = prompt.trim()
  }
  request.status = rejected >= MAX_ATTEMPTS ? 'held' : 'pending'
  request.updatedAt = now()
}

export function summary(queue) {
  const counts = Object.fromEntries(STATUSES.map((status) => [status, 0]))
  for (const request of queue.requests) counts[request.status] += 1
  const tickets = [
    ...new Set(
      queue.requests
        .filter((item) => ['pending', 'held'].includes(item.status) && item.ticket)
        .map((item) => item.ticket),
    ),
  ]
  return { counts, tickets, updatedAt: queue.updatedAt }
}
