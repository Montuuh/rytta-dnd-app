/** Rytta inline mini-markup used by bundled SRD text: `*emphasis*` and `**strong**`. */
export type InlineSegment = { kind: 'text' | 'em' | 'strong'; text: string }

const pattern = /\*\*([^*]+)\*\*|\*([^*]+)\*/g

export function parseInline(source: string): InlineSegment[] {
  const out: InlineSegment[] = []
  let last = 0
  for (const match of source.matchAll(pattern)) {
    const at = match.index
    if (at > last) out.push({ kind: 'text', text: source.slice(last, at) })
    if (match[1] !== undefined) out.push({ kind: 'strong', text: match[1] })
    else out.push({ kind: 'em', text: match[2]! })
    last = at + match[0].length
  }
  if (last < source.length) out.push({ kind: 'text', text: source.slice(last) })
  return out
}

/** Plain text without markup (summaries, accessible names). */
export const stripInline = (source: string) => source.replace(/\*+/g, '')
