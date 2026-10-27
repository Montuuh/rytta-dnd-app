import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import path from 'node:path'

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name).replaceAll('\\', '/')
    return entry.isDirectory() ? walk(file) : [file]
  })
}
const sources = [
  ...walk('src').filter(
    (file) =>
      !/\.test\.|\.d\.ts$/.test(file) &&
      (/\.(tsx|css)$/.test(file) ||
        file.startsWith('src/shared/i18n/') ||
        file.startsWith('src/app/')),
  ),
  'index.html',
  'package-lock.json',
].sort()
const hash = createHash('sha256')
for (const file of sources)
  hash.update(file + '\n' + readFileSync(file, 'utf8').replaceAll('\r\n', '\n') + '\n')
const sourceDigest = hash.digest('hex')
if (process.argv.includes('--fingerprint')) {
  console.log(sourceDigest)
} else {
  const file = 'docs/evidence/ui-review-current.json'
  if (!existsSync(file))
    throw new Error(
      'UI review missing. Invoke the ui-ux reviewer and record its actual verdict; see docs/ui-review.md.',
    )
  const review = JSON.parse(readFileSync(file, 'utf8'))
  if (
    review.reviewer !== 'ui-ux' ||
    review.verdict !== 'PASS' ||
    review.sourceDigest !== sourceDigest ||
    !review.report ||
    !existsSync(review.report)
  ) {
    throw new Error(
      'UI review is missing, blocked or stale. Request an independent ui-ux review of the current interface. Never overwrite the verdict to bypass this check.',
    )
  }
  console.log(`UI review PASS for ${review.ticket}; source snapshot matches.`)
}
