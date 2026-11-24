// Checks Rytta content files with the parser the library's import uses, before they are uploaded.
// Usage: npm run content:check -- <file.json> [more files]
import { readFileSync } from 'node:fs'
import { createServer } from 'vite'

const fileErrors = {
  tooLarge: 'larger than 20 MB',
  notJson: 'not valid JSON',
  notContent:
    'not a Rytta content file ({ "format": "rytta-content", "version": 1, "entries": [...] })',
}
const reasons = {
  kind: 'kind missing or not lowercase letters, digits and hyphens',
  key: 'key missing or not lowercase letters, digits and hyphens (80 at most)',
  name: 'needs a name in English or Spanish, 120 characters at most',
  data: 'data must be an object',
  size: 'data larger than 128 KB',
  index: 'data.index must be an object of 4 KB at most',
  duplicate: 'same kind and key as an earlier entry',
}

const files = process.argv.slice(2)
if (files.length === 0) {
  console.error('Usage: npm run content:check -- <file.json> [more files]')
  process.exit(2)
}

// The parser lives in the app's source: Vite loads it with the app's own path aliases.
const server = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
})
let failed = false
try {
  const { parseContentFile } = await server.ssrLoadModule(
    '/src/features/content-library/domain/import-file.ts',
  )
  for (const file of files) {
    let source
    try {
      source = readFileSync(file, 'utf8')
    } catch {
      console.error(`${file}: cannot be read`)
      failed = true
      continue
    }
    const result = parseContentFile(source)
    if (typeof result === 'string') {
      console.error(`${file}: ${fileErrors[result] ?? result}`)
      failed = true
      continue
    }
    const kinds = result.groups.map((group) => `${group.entries.length} ${group.kind}`).join(', ')
    console.log(
      `${file}: ${result.total} entries, ${result.total - result.problems.length} valid${kinds ? ` (${kinds})` : ''}`,
    )
    for (const problem of result.problems)
      console.error(
        `  entry ${problem.position}${problem.key ? ` (${problem.key})` : ''}: ${
          reasons[problem.reason] ?? `its index does not fit the ${problem.reason} form`
        }`,
      )
    if (result.problems.length > 0) failed = true
  }
} finally {
  await server.close()
}
process.exit(failed ? 1 : 0)
