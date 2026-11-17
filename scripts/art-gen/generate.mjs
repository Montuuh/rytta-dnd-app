#!/usr/bin/env node
// Local art generator, never imported by the app. Calls Google Cloud image models with the
// machine's gcloud application-default credentials. Never imported by the app.
//
//   node scripts/art-gen/generate.mjs --prompt "..." --out art/generated/x.png
//     [--aspect 16:9] [--size 2K] [--model gemini-3-pro-image] [--ref a.png --ref b.png]
//   node scripts/art-gen/generate.mjs --batch scripts/art-gen/batch.json [--concurrency 3]
//
// Batch file: { "style": "shared style suffix", "items": [{ "out", "prompt", "aspect", "size", "refs" }] }
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, extname, resolve } from 'node:path'

const DEFAULT_MODEL = 'gemini-3-pro-image'
const FALLBACK_MODEL = 'gemini-3.1-flash-image'

function readEnvFile(path) {
  if (!existsSync(path)) return {}
  const out = {}
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
    if (m) out[m[1]] = m[2].replace(/^"|"$/g, '').trim()
  }
  return out
}

function parseArgs(argv) {
  const args = { ref: [] }
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i].replace(/^--/, '')
    const value = argv[i + 1]
    i += 1
    if (key === 'ref') args.ref.push(value)
    else args[key] = value
  }
  return args
}

function accessToken() {
  const gcloud = process.platform === 'win32' ? 'gcloud.cmd' : 'gcloud'
  return execFileSync(gcloud, ['auth', 'application-default', 'print-access-token'], {
    encoding: 'utf8',
    shell: process.platform === 'win32',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim()
}

const MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
}

async function generateOne({
  project,
  token,
  model,
  prompt,
  out,
  aspect = '1:1',
  size = '2K',
  refs = [],
}) {
  const parts = refs.map((ref) => ({
    inlineData: {
      mimeType: MIME[extname(ref).toLowerCase()] ?? 'image/png',
      data: readFileSync(resolve(ref)).toString('base64'),
    },
  }))
  parts.push({ text: prompt })
  const url = `https://aiplatform.googleapis.com/v1/projects/${project}/locations/global/publishers/google/models/${model}:generateContent`
  const body = {
    contents: [{ role: 'user', parts }],
    generationConfig: {
      responseModalities: ['IMAGE'],
      imageConfig: { aspectRatio: aspect, imageSize: size },
    },
  }
  let lastError = ''
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    let response
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'x-goog-user-project': project,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(150000),
      })
    } catch (error) {
      lastError = error.message
      continue
    }
    const json = await response.json().catch(() => ({}))
    const inline = json.candidates?.[0]?.content?.parts?.find(
      (part) => part.inlineData?.data,
    )?.inlineData
    if (response.ok && inline) {
      const target = resolve(out)
      mkdirSync(dirname(target), { recursive: true })
      writeFileSync(target, Buffer.from(inline.data, 'base64'))
      return { out, model, mimeType: inline.mimeType }
    }
    lastError =
      json.error?.message ?? json.candidates?.[0]?.finishReason ?? `HTTP ${response.status}`
    if (response.status === 404 || response.status === 400) break
    await new Promise((done) => setTimeout(done, 4000 * attempt))
  }
  throw new Error(`${out}: ${lastError}`)
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const env = { ...readEnvFile(resolve('.env.local')), ...process.env }
  const project = env.GOOGLE_CLOUD_PROJECT
  if (!project) throw new Error('Set GOOGLE_CLOUD_PROJECT in .env.local (not a VITE_ variable).')
  const token = accessToken()
  const model = args.model ?? env.ART_IMAGE_MODEL ?? DEFAULT_MODEL

  let items
  if (args.batch) {
    const batch = JSON.parse(readFileSync(resolve(args.batch), 'utf8'))
    items = batch.items
      .filter((item) => args.force === 'true' || !existsSync(resolve(item.out)))
      .map((item) => ({
        ...item,
        prompt: batch.style ? `${item.prompt}\n\n${batch.style}` : item.prompt,
      }))
  } else {
    if (!args.prompt || !args.out) throw new Error('--prompt and --out are required')
    items = [
      { prompt: args.prompt, out: args.out, aspect: args.aspect, size: args.size, refs: args.ref },
    ]
  }

  const concurrency = Number(args.concurrency ?? 3)
  const queue = [...items]
  let failed = 0
  await Promise.all(
    Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
      for (let item = queue.shift(); item; item = queue.shift()) {
        try {
          let result
          try {
            result = await generateOne({ project, token, model, ...item })
          } catch (error) {
            if (model === FALLBACK_MODEL) throw error
            console.warn(`retry with ${FALLBACK_MODEL}: ${error.message}`)
            result = await generateOne({ project, token, model: FALLBACK_MODEL, ...item })
          }
          console.log(`ok ${result.out} (${result.model}, ${result.mimeType})`)
        } catch (error) {
          failed += 1
          console.error(`FAILED ${error.message}`)
        }
      }
    }),
  )
  if (failed > 0) process.exitCode = 1
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
