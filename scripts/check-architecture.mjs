import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  return (
    await Promise.all(
      entries.map((e) =>
        e.isDirectory() ? walk(path.join(directory, e.name)) : path.join(directory, e.name),
      ),
    )
  ).flat()
}

const failures = []
for (const file of (await walk('src')).filter((f) => /\.[jt]sx?$/.test(f))) {
  const normalized = file.replaceAll('\\', '/')
  const content = await readFile(file, 'utf8')
  const imports = [...content.matchAll(/(?:from\s+|import\s*\(\s*|import\s+)["']([^"']+)["']/g)]
  for (const [, source] of imports) {
    const target = source.startsWith('@/')
      ? `src/${source.slice(2)}`
      : source.startsWith('.')
        ? path.join(path.dirname(file), source).replaceAll('\\', '/')
        : source
    if (normalized.startsWith('src/shared/') && /src\/(app|pages|features)\//.test(target))
      failures.push(`${file}: shared cannot import ${source}`)
    if (normalized.startsWith('src/features/') && /src\/(app|pages)\//.test(target))
      failures.push(`${file}: features cannot import ${source}`)
    const currentFeature = normalized.match(/^src\/features\/([^/]+)\//)?.[1]
    const targetFeature = target.match(/^src\/features\/([^/]+)(.*)$/)
    if (
      targetFeature &&
      currentFeature !== targetFeature[1] &&
      targetFeature[2] &&
      !/^\/index(?:\.ts)?$/.test(targetFeature[2])
    )
      failures.push(`${file}: use the ${targetFeature[1]} public entrypoint`)
    if (
      source === '@supabase/supabase-js' &&
      !normalized.startsWith('src/shared/api/') &&
      !/src\/features\/[^/]+\/data\//.test(normalized)
    )
      failures.push(`${file}: Supabase belongs in an adapter`)
  }
  if (/dangerouslySetInnerHTML/.test(content))
    failures.push(`${file}: rich text needs an explicit sanitization design`)
}
if (failures.length) {
  console.error(failures.join('\n'))
  process.exitCode = 1
} else console.log('Architecture boundaries passed.')
