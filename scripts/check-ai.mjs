import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { parse as yaml } from 'yaml'
import { parse as toml } from 'smol-toml'

const root = new URL('../', import.meta.url)
const read = (relative) => readFileSync(new URL(relative, root), 'utf8')
const skills = readdirSync(new URL('.agents/skills/', root))
for (const name of skills) {
  const content = read(`.agents/skills/${name}/SKILL.md`)
  const frontmatter = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  assert(frontmatter, `Missing skill frontmatter: ${name}`)
  const definition = yaml(frontmatter[1])
  assert.equal(definition.name, name)
  assert.match(name, /^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  assert(definition.description?.length > 30, `Skill trigger too vague: ${name}`)
  assert(!/TODO|\[INSERT|PLACEHOLDER/.test(content), `Unfinished skill: ${name}`)
  const metadata = yaml(read(`.agents/skills/${name}/agents/openai.yaml`))
  assert(metadata.interface.default_prompt.includes(`$${name}`))
  assert(
    metadata.interface.short_description.length >= 25 &&
      metadata.interface.short_description.length <= 64,
  )
}
const agents = readdirSync(new URL('.codex/agents/', root))
for (const file of agents) {
  const agent = toml(read(`.codex/agents/${file}`))
  assert.equal(`${agent.name}.toml`, file)
  assert(agent.description && agent.developer_instructions)
}
for (const file of readdirSync(new URL('.cursor/rules/', root))) {
  const rule = yaml(read(`.cursor/rules/${file}`).match(/^---\r?\n([\s\S]*?)\r?\n---/)[1])
  assert(rule.description && rule.globs && typeof rule.alwaysApply === 'boolean')
}
const hooks = JSON.parse(read('.codex/hooks.json'))
assert.equal(hooks.hooks.SessionStart[0].hooks[0].type, 'command')
const result = spawnSync(
  process.execPath,
  [fileURLToPath(new URL('.codex/hooks/session-context.mjs', root))],
  { encoding: 'utf8' },
)
assert.equal(result.status, 0, result.stderr)
const output = JSON.parse(result.stdout).hookSpecificOutput
assert.equal(output.hookEventName, 'SessionStart')
assert(output.additionalContext.includes('RYT-'))
console.log(
  `AI contracts passed: ${skills.length} skills, ${agents.length} agents, scoped rules and session hook.`,
)
