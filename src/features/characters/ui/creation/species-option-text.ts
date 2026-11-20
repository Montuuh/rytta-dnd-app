export type Body = { blocks: readonly Block[] }
type Block =
  | { t: 'p'; x: string; lead?: string }
  | { t: 'ul'; items: string[] }
  | { t: 'table'; rows: string[][] }

/** The glossary line of one option: a paragraph led by its name, or its table row's first
 * benefit. Ancestries already name their damage type in the label and return null. */
export function optionText(body: Body | undefined, label: string): string | null {
  for (const block of body?.blocks ?? []) {
    if (block.t === 'p' && block.lead?.startsWith(label)) return block.x
    if (block.t === 'table') {
      const row = block.rows.find((cells) => cells[0] === label && cells.length > 2)
      if (row) return row[1] ?? null
    }
  }
  return null
}
