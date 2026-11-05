// Renders game-icons.net SVGs (CC BY 3.0) as field-journal plates for the bestiary art (ADR 030):
// chestnut ink on parchment, 720px PNG. Run manually; build_images.py turns them into WebP.
// Usage: node scripts/bestiary/render_icons.mjs <game-icons repo> <selection.json> <out-dir>
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from '@playwright/test'

const [repo, selectionPath, out] = process.argv.slice(2)
const selection = JSON.parse(readFileSync(selectionPath, 'utf8'))
// An icon in its default ink, or tinted (dragons take their colour: {"icon": ..., "ink": "#2f5f93"}).
const ink = (s) => s.ink ?? '#5b2e10'
const plates = [
  ...new Map(
    Object.values(selection)
      .filter((s) => s.icon)
      .map((s) => [`${s.icon}@${ink(s)}`, s]),
  ).values(),
]
mkdirSync(out, { recursive: true })

/** File name of a rendered plate; build_images.py derives the same name. */
const plateName = (s) => `${s.icon.replace('/', '__')}${s.ink ? `__${s.ink.slice(1)}` : ''}`

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 720, height: 720 } })
for (const plate of plates) {
  const icon = plate.icon
  const svg = readFileSync(join(repo, `${icon}.svg`), 'utf8')
    // The square background goes; the white glyph becomes ink.
    .replace(/<path d="M0 0h512v512H0z"\s*\/>/, '')
    .replace(/fill="#fff"/g, `fill="${ink(plate)}"`)
  await page.setContent(`<!doctype html><html><body style="margin:0">
    <div style="width:720px;height:720px;display:grid;place-items:center;
      background:radial-gradient(circle at 50% 40%, #f6ecd9 0%, #e9d9bd 70%, #dcc7a3 100%)">
      <div style="width:520px;height:520px">${svg.replace('<svg ', '<svg width="520" height="520" ')}</div>
    </div></body></html>`)
  writeFileSync(join(out, `${plateName(plate)}.png`), await page.screenshot({ type: 'png' }))
  console.log(icon)
}
await browser.close()
