import { test, expect, type Page } from '@playwright/test'
import { campaignId, identityFixture } from './fixtures/identity.ts'
import { combatServer } from './fixtures/combat.ts'

// RYT-117: long lists mount only what is near the viewport. After a jump, scrolling up or down
// must move the reader's rows by exactly the distance scrolled, whatever the engine does with
// scroll anchoring (this spec runs in Chromium and, where installed, WebKit).
const tolerance = 40

const norm = (text: string) =>
  text.normalize('NFD').replace(/\p{M}/gu, '').trim().charAt(0).toUpperCase()

/** The row nearest the middle of the screen, and the first row under the sticky bars. */
async function spots(page: Page, row: string, key: string, below: number) {
  return page.evaluate(
    ([rowSel, keyAttr, clear]) => {
      const rows = [...document.querySelectorAll<HTMLElement>(rowSel as string)]
      const mid = innerHeight / 2
      let middle: HTMLElement | null = null
      let first: HTMLElement | null = null
      for (const el of rows) {
        const r = el.getBoundingClientRect()
        if (r.bottom < 0 || r.top > innerHeight) continue
        if (!middle || Math.abs(r.top - mid) < Math.abs(middle.getBoundingClientRect().top - mid))
          middle = el
        if (r.top >= (clear as number) && (!first || r.top < first.getBoundingClientRect().top))
          first = el
      }
      const read = (el: HTMLElement | null) =>
        el
          ? {
              key: el.closest<HTMLElement>(`[${keyAttr}]`)?.getAttribute(keyAttr as string) ?? '',
              top: el.getBoundingClientRect().top,
              name: el.textContent ?? '',
            }
          : null
      return { middle: read(middle), first: read(first) }
    },
    [row, key, below] as const,
  )
}
async function topOf(page: Page, keyAttr: string, key: string, row: string) {
  return page.evaluate(
    ([attr, value, rowSel]) => {
      const holder = [...document.querySelectorAll<HTMLElement>(`[${attr}]`)].find(
        (el) => el.getAttribute(attr as string) === value,
      )
      const el = holder?.matches(rowSel as string)
        ? holder
        : holder?.querySelector(rowSel as string)
      return el ? (el as HTMLElement).getBoundingClientRect().top : null
    },
    [keyAttr, key, row] as const,
  )
}

async function walk(page: Page, row: string, keyAttr: string, below: number, direction: 1 | -1) {
  const letters: string[] = []
  for (let step = 0; step < 18; step++) {
    const before = await spots(page, row, keyAttr, below)
    if (!before.middle) break
    const startY = await page.evaluate(() => scrollY)
    const maxY = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight)
    const distance = Math.round(page.viewportSize()!.height * 0.8) * direction
    await page.evaluate((dy) => window.scrollBy({ top: dy, behavior: 'instant' }), distance)
    // Wait until the layout stops moving (sections mount a few frames after the scroll).
    let last = Number.NaN
    for (let settle = 0; settle < 20; settle++) {
      await page.waitForTimeout(150)
      const now = await topOf(page, keyAttr, before.middle.key, row)
      if (now !== null && Math.abs(now - last) < 0.5) break
      last = now ?? Number.NaN
    }
    const endY = await page.evaluate(() => scrollY)
    if (endY === startY) break
    // At the end of the page the scroll is cut short: only full steps are measured.
    const clamped = direction === -1 ? endY <= 0 : endY >= maxY - 1
    const after = await topOf(page, keyAttr, before.middle.key, row)
    // The row the reader was looking at moved by what was scrolled, not by a re-layout.
    if (clamped) break
    expect(after, `row ${before.middle.name} unmounted at step ${step}`).not.toBeNull()
    expect(Math.abs(after! - (before.middle.top - distance)), `step ${step}`).toBeLessThanOrEqual(
      tolerance,
    )
    const first = (await spots(page, row, keyAttr, below)).first
    if (first) letters.push(norm(first.name))
  }
  // The first visible row only ever moves one way through the alphabet.
  for (let i = 1; i < letters.length; i++)
    if (direction === -1) expect(letters[i]! <= letters[i - 1]!, letters.join('')).toBe(true)
    else expect(letters[i]! >= letters[i - 1]!, letters.join('')).toBe(true)
  expect(letters.length).toBeGreaterThan(3)
}

test('RYT-117 bestiary: after a jump, scrolling up and down keeps the reader’s place', async ({
  page,
}, info) => {
  test.skip(
    (info.project.use.viewport?.width ?? 0) >= 768,
    'Beside the stat block the list scrolls inside',
  )
  test.setTimeout(180_000)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await identityFixture(page, { party: true, sheet: 'complete', modules: ['party', 'combat'] })
  await combatServer().install(page)
  await page.goto(`./#/campaign/${campaignId}/members?panel=bestiary`)
  await expect(page.getByText('330 criaturas', { exact: true })).toBeVisible({ timeout: 30_000 })
  await page
    .getByRole('navigation', { name: 'Saltar a un grupo' })
    .getByRole('button', { name: 'V', exact: true })
    .click()
  await page.waitForTimeout(1200)
  await walk(page, '.bst-row-main', 'data-row-key', 150, -1)
  await walk(page, '.bst-row-main', 'data-row-key', 150, 1)
})

test('RYT-117 glossary: after a jump, scrolling up and down keeps the reader’s place', async ({
  page,
}, info) => {
  test.skip(info.project.name.endsWith('desktop'), 'Beside the reader the index scrolls inside')
  test.setTimeout(180_000)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await identityFixture(page, { party: true, sheet: 'complete', modules: ['party', 'glossary'] })
  // RYT-184: the glossary lands on its search; `cat=all` opens the whole list.
  await page.goto(`./#/campaign/${campaignId}/glossary?cat=all`)
  await expect(page.getByText('838 entradas')).toBeVisible({ timeout: 30_000 })
  await page
    .getByRole('navigation', { name: 'Saltar a la letra' })
    .getByRole('button', { name: 'V', exact: true })
    .click()
  await page.waitForTimeout(1200)
  await walk(page, '.gl-row', 'data-entry-id', 110, -1)
  await walk(page, '.gl-row', 'data-entry-id', 110, 1)
})

test('RYT-117 holding ArrowDown through the whole bestiary never drops focus to the page', async ({
  page,
}, info) => {
  test.skip(info.project.name.endsWith('desktop'), 'Phones and tablets only')
  test.setTimeout(180_000)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await identityFixture(page, { party: true, sheet: 'complete', modules: ['party', 'combat'] })
  await combatServer().install(page)
  await page.goto(`./#/campaign/${campaignId}/members?panel=bestiary`)
  await expect(page.getByText('330 criaturas', { exact: true })).toBeVisible({ timeout: 30_000 })
  await page.locator('.bst-row-main').first().focus()
  // Key repeat: no waiting between presses.
  for (let i = 0; i < 329; i++) await page.keyboard.press('ArrowDown')
  await expect(page.locator('.bst-row-main:focus')).toContainText('Zombi')
  expect(await page.evaluate(() => document.activeElement?.tagName)).toBe('BUTTON')
})
