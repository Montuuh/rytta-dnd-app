#!/usr/bin/env node
// Image queue command line (docs/art-queue.md). Local tool, never imported by the app.
//
//   node scripts/art-queue/queue.mjs list [--status pending] [--json]
//   node scripts/art-queue/queue.mjs summary
//   node scripts/art-queue/queue.mjs add <requests.json>        { batches?: [...], requests: [...] }
//   node scripts/art-queue/queue.mjs mark <IMG-001>             the picture is saved at its path
//   node scripts/art-queue/queue.mjs check [IMG-001 ...]        automatic checks of generated requests
//   node scripts/art-queue/queue.mjs approve <IMG-001> [--note "..."]
//   node scripts/art-queue/queue.mjs reject <IMG-001> --reason "..." [--prompt-file new.txt]
//   node scripts/art-queue/queue.mjs import [IMG-001 ...]       runs each set's import for approved requests
//   node scripts/art-queue/queue.mjs cancel <IMG-001> --reason "..."
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  ROOT,
  SETS,
  STATUSES,
  addRequests,
  approve,
  failing,
  findRequest,
  inspect,
  loadQueue,
  markGenerated,
  now,
  reject,
  saveQueue,
  summary,
} from './lib.mjs'

const [command, ...rest] = process.argv.slice(2)
const flags = {}
const ids = []
for (let i = 0; i < rest.length; i += 1) {
  if (rest[i].startsWith('--')) {
    const key = rest[i].slice(2)
    const value = rest[i + 1] && !rest[i + 1].startsWith('--') ? rest[(i += 1)] : true
    flags[key] = value
  } else ids.push(rest[i])
}

function line(request) {
  const attempt = request.attempts.at(-1)
  const checks =
    attempt?.checks?.filter((c) => c.level !== 'ok').map((c) => `${c.level}: ${c.message}`) ?? []
  return [
    `${request.id} [${request.status}] ${request.set} · ${request.title}${request.ticket ? ` (${request.ticket})` : ''}`,
    `  path: ${request.path}  ${request.aspect} ${request.background} min ${request.minSide}px  attempts: ${request.attempts.length}`,
    ...checks.map((c) => `  ${c}`),
    ...(attempt?.review ? [`  review: ${attempt.review.verdict} ${attempt.review.reason}`] : []),
  ].join('\n')
}

const queue = loadQueue()

switch (command) {
  case 'list': {
    const status = typeof flags.status === 'string' ? flags.status : null
    if (status && !STATUSES.includes(status))
      throw new Error(`status must be one of ${STATUSES.join(', ')}`)
    const rows = queue.requests.filter((item) => !status || item.status === status)
    if (flags.json) console.log(JSON.stringify(rows, null, 2))
    else console.log(rows.length ? rows.map(line).join('\n') : 'No requests.')
    break
  }
  case 'summary': {
    console.log(JSON.stringify(summary(queue)))
    break
  }
  case 'add': {
    if (!ids[0]) throw new Error('add needs a JSON file')
    const added = addRequests(
      queue,
      JSON.parse(readFileSync(resolve(process.cwd(), ids[0]), 'utf8')),
    )
    saveQueue(queue)
    console.log(`Added ${added.join(', ') || 'no requests'}.`)
    break
  }
  case 'mark': {
    const request = findRequest(queue, ids[0])
    const attempt = markGenerated(request, 'cli')
    saveQueue(queue)
    console.log(line(request))
    if (failing(attempt).length) process.exitCode = 1
    break
  }
  case 'check': {
    const targets = ids.length
      ? ids.map((id) => findRequest(queue, id))
      : queue.requests.filter((r) => r.status === 'generated')
    for (const request of targets) {
      const result = inspect(request)
      const attempt = request.attempts.at(-1)
      const changed = attempt && attempt.sha256 !== result.sha256
      console.log(
        `${request.id} ${request.path}${changed ? ' (file changed since it was marked: run mark again)' : ''}`,
      )
      for (const check of result.checks)
        console.log(`  ${check.level.padEnd(4)} ${check.key}: ${check.message}`)
      console.log(`  acceptance:\n${request.acceptance.map((a) => `    - ${a}`).join('\n')}`)
      if (failing(result).length) process.exitCode = 1
    }
    if (!targets.length) console.log('No generated requests to check.')
    break
  }
  case 'approve': {
    approve(findRequest(queue, ids[0]), typeof flags.note === 'string' ? flags.note : '')
    saveQueue(queue)
    console.log(`${ids[0]} approved.`)
    break
  }
  case 'reject': {
    const request = findRequest(queue, ids[0])
    const prompt =
      typeof flags['prompt-file'] === 'string'
        ? readFileSync(resolve(process.cwd(), flags['prompt-file']), 'utf8')
        : null
    reject(request, flags.reason, prompt)
    saveQueue(queue)
    console.log(`${request.id} is now ${request.status}.`)
    break
  }
  case 'import': {
    const targets = ids.length
      ? ids.map((id) => findRequest(queue, id))
      : queue.requests.filter((r) => r.status === 'approved')
    for (const request of targets)
      if (request.status !== 'approved')
        throw new Error(`${request.id} is ${request.status}, not approved`)
    for (const set of new Set(targets.map((r) => r.set))) {
      const runner = SETS[set].import
      const group = targets.filter((r) => r.set === set)
      if (runner) {
        console.log(`> ${runner.join(' ')}`)
        const run = spawnSync(runner[0], runner.slice(1), { cwd: ROOT, stdio: 'inherit' })
        if (run.status !== 0)
          throw new Error(`${set} import failed (exit ${run.status}); nothing marked imported`)
      } else
        console.log(
          `${set}: no import command; wire ${group.map((r) => r.id).join(', ')} in their ticket.`,
        )
      for (const request of group) {
        request.status = 'imported'
        request.importedAt = now()
        request.updatedAt = now()
      }
    }
    saveQueue(queue)
    console.log(
      targets.length ? `Imported ${targets.map((r) => r.id).join(', ')}.` : 'No approved requests.',
    )
    break
  }
  case 'cancel': {
    const request = findRequest(queue, ids[0])
    if (typeof flags.reason !== 'string') throw new Error('cancel needs --reason')
    request.status = 'cancelled'
    request.notes = [request.notes, `Cancelled: ${flags.reason}`].filter(Boolean).join('\n')
    request.updatedAt = now()
    saveQueue(queue)
    console.log(`${request.id} cancelled.`)
    break
  }
  default:
    console.log(
      readFileSync(new URL(import.meta.url), 'utf8')
        .split('\n')
        .slice(1, 13)
        .join('\n'),
    )
    process.exitCode = command ? 1 : 0
}
