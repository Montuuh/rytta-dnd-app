/**
 * Glossary-style bodies keep their text as blocks (paragraphs with an optional bold lead, lists and
 * tables). The editor shows them as plain text: paragraphs separated by a blank line, a lead as
 * `**Lead.** text`, list items as `- item`, and each table as a `[[table:N]]` line that keeps the
 * original table in place (tables are edited in the JSON tab).
 */
export type TextBlock =
  | { t: 'p'; x: string; lead?: string }
  | { t: 'ul'; items: string[] }
  | { t: 'table'; caption?: string; head?: string[]; rows: string[][] }

const isBlock = (value: unknown): value is TextBlock =>
  !!value && typeof value === 'object' && typeof (value as { t?: unknown }).t === 'string'

export function blocksToText(blocks: unknown): string {
  if (!Array.isArray(blocks)) return ''
  let table = 0
  return blocks
    .filter(isBlock)
    .map((block) => {
      if (block.t === 'table') return `[[table:${++table}]]`
      if (block.t === 'ul') return block.items.map((item) => `- ${item}`).join('\n')
      if (block.lead) return `**${block.lead}** ${block.x}`.trimEnd()
      // A paragraph that starts in bold without a lead: the backslash keeps it from reading as one.
      return block.x.startsWith('**') ? `\\${block.x}` : block.x
    })
    .join('\n\n')
}

const tableLine = /^\[\[table:(\d+)\]\]$/
const leadLine = /^\*\*([^*\n]{1,200})\*\*(?:\s+([\s\S]*))?$/

export function textToBlocks(text: string, original: unknown): TextBlock[] {
  const tables = (Array.isArray(original) ? original : []).filter(
    (block): block is Extract<TextBlock, { t: 'table' }> => isBlock(block) && block.t === 'table',
  )
  return text
    .replace(/\r\n?/g, '\n')
    .split(/\n[ \t]*\n/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .flatMap((chunk): TextBlock[] => {
      const table = chunk.match(tableLine)
      if (table) {
        const kept = tables[Number(table[1]) - 1]
        return kept ? [kept] : []
      }
      const lines = chunk.split('\n').map((line) => line.trim())
      if (lines.every((line) => line.startsWith('- ')))
        return [{ t: 'ul', items: lines.map((line) => line.slice(2).trim()).filter(Boolean) }]
      const paragraph = lines.join(' ')
      if (paragraph.startsWith('\\**')) return [{ t: 'p', x: paragraph.slice(1) }]
      const lead = paragraph.match(leadLine)
      return [
        lead ? { t: 'p', lead: lead[1]!, x: (lead[2] ?? '').trim() } : { t: 'p', x: paragraph },
      ]
    })
}

/** Tables in the text that are not placeholders of the original ones (shown as a warning). */
export const tableCount = (blocks: unknown) =>
  Array.isArray(blocks) ? blocks.filter((block) => isBlock(block) && block.t === 'table').length : 0
