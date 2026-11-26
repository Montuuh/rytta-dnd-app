import { readFileSync } from 'node:fs'
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { beaId, campaignId, characterId, identityFixture, peerId } from './fixtures/identity.ts'
import { capture, expectTouchTargets, limitMatrix } from './fixtures/audit.ts'
import { libraryServer, srdLibraryPackId } from './fixtures/library.ts'
import { shopsFixture } from './fixtures/shops.ts'
import { tradeServer } from './fixtures/trades.ts'

// RYT-176: a magic item of the SRD keeps its whole text in a campaign. The longest one, the
// Mysterious Deck (a table and a stat block, about 8500 characters in Spanish), is read on the
// item card in both languages and themes, at 150% text.
type Entry = {
  key: string
  name_en: string
  name_es: string
  data: { en: { description: string }; es: { description: string } }
}
const deck = (
  JSON.parse(readFileSync('tests/fixtures/srd/items/magic-items.json', 'utf8')) as {
    entries: Entry[]
  }
).entries.find((entry) => entry.key === 'mysterious-deck')!
const evidence = 'docs/evidence/ui-review/ryt-176'

for (const [language, scheme] of [
  ['es', 'dark'],
  ['en', 'light'],
] as const)
  test(`${language} ${scheme} item card with the longest SRD magic item`, async ({
    page,
  }, info) => {
    limitMatrix(info, language === 'es')
    const es = language === 'es'
    await page.addInitScript(
      ({ language, scheme }) => {
        localStorage.setItem('rytta-language', language)
        localStorage.setItem('rytta-color-scheme', scheme)
      },
      { language, scheme },
    )
    const f = await identityFixture(page, { player: true, sheet: 'complete', inventory: true })
    const ring = f.inventory.definitions.find((d) => d.name === 'Anillo de la marea')!
    Object.assign(ring, {
      name: deck.name_es,
      rarity: 'legendary',
      description: deck.data.es.description,
      translations: {
        en: { name: deck.name_en, description: deck.data.en.description },
        es: { name: deck.name_es, description: deck.data.es.description },
      },
    })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto(`./campaign/${campaignId}/inventory`)
    await page.addStyleTag({ content: 'html { font-size: 150% }' })
    const name = es ? deck.name_es : deck.name_en
    await page.getByRole('button', { name: new RegExp(`${name}, (cantidad|quantity) 1`) }).click()
    const card = page.getByRole('dialog')
    await expect(card.locator('.mantine-Drawer-title')).toHaveText(name)
    await expect(card.locator('.item-card-rarity')).toContainText(es ? 'Legendario' : 'Legendary')
    // The whole text, from its subtitle to the last line of the stat block.
    const text = deck.data[language].description
    const shown = (await card.locator('.item-card-description').innerText()).replace(/\s+/g, ' ')
    expect(shown).toBe(text.replace(/\s+/g, ' '))
    expect(shown.length).toBeGreaterThan(7500)
    // The card scrolls inside the viewport; the page never scrolls sideways.
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    // No line of the text runs past the card. The text itself is measured: a glossary term at a
    // line end has an invisible hit area that reaches a few pixels further.
    expect(
      await card.locator('.item-card-description').evaluate((node) => {
        const range = document.createRange()
        range.selectNodeContents(node)
        return range.getBoundingClientRect().right <= node.getBoundingClientRect().right + 1
      }),
    ).toBe(true)
    await expectTouchTargets(card, 'button:visible')
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
          .include('[role="dialog"]')
          .analyze()
      ).violations,
    ).toEqual([])
    await capture(page, `${evidence}/card-${language}-${scheme}-${info.project.name}.png`)
    // The actions under the long text are reachable by keyboard and Escape closes the card.
    await card.getByRole('button').last().focus()
    await expect(card.getByRole('button').last()).toBeFocused()
    await capture(page, `${evidence}/card-end-${language}-${scheme}-${info.project.name}.png`, {
      fullPage: false,
    })
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })

const flat = (text: string) => text.replace(/\s+/g, ' ').trim()

test('a shop that sells an item with a long text still opens and keeps its lines', async ({
  page,
}, info) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const fixture = await identityFixture(page, {
    player: true,
    sheet: 'complete',
    inventory: true,
    modules: ['party', 'inventory', 'shops'],
  })
  const ring = fixture.inventory.definitions.find((d) => d.name === 'Anillo de la marea')!
  Object.assign(ring, {
    rarity: 'legendary',
    description: deck.data.es.description,
    translations: { en: { name: 'Tide Ring', description: deck.data.en.description } },
  })
  await shopsFixture(page, fixture)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(`./campaign/${campaignId}/shops`)
  await expect(page.getByRole('heading', { level: 1, name: 'Tiendas' })).toBeVisible()
  const listing = page.locator('.listing-card', { hasText: 'Anillo de la marea' })
  await expect(listing).toBeVisible()
  await listing.locator('.listing-main').click()
  const detail = page.getByRole('dialog', { name: 'Anillo de la marea' })
  const text = detail.locator('.item-description')
  expect(flat(await text.innerText())).toBe(flat(deck.data.es.description))
  // Paragraphs and table rows keep their own lines.
  expect(await text.evaluate((node) => getComputedStyle(node).whiteSpace)).toBe('pre-line')
  expect((await text.innerText()).split(/\n/).length).toBeGreaterThan(40)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await expectTouchTargets(detail, 'button:visible')
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .include('[role="dialog"]')
        .analyze()
    ).violations,
  ).toEqual([])
  await capture(page, `${evidence}/shop-detail-${info.project.name}.png`, { fullPage: false })
  expect(errors).toEqual([])
})

test('a trade shows the whole text of the partner item', async ({ browser }, info) => {
  test.setTimeout(120_000)
  const server = tradeServer({ daggerDescription: deck.data.es.description })
  const options = { viewport: info.project.use.viewport, hasTouch: info.project.use.hasTouch }
  const arin = await (await browser.newContext(options)).newPage()
  const bea = await (await browser.newContext(options)).newPage()
  const errors: string[] = []
  for (const page of [arin, bea]) {
    page.on('pageerror', (error) => errors.push(error.message))
    await page.emulateMedia({ reducedMotion: 'reduce' })
  }
  await identityFixture(arin, { player: true, party: true, sheet: 'complete' })
  await identityFixture(bea, { player: true, party: true, sheet: 'complete', as: peerId })
  await server.install(arin, characterId)
  await server.install(bea, beaId)
  await arin.goto(`./campaign/${campaignId}/party`)
  await bea.goto(`./campaign/${campaignId}/party`)
  await arin
    .getByRole('article', { name: 'Bea' })
    .getByRole('button', { name: 'Comerciar con Bea' })
    .click()
  const invite = bea.getByRole('dialog', { name: 'Arin quiere comerciar contigo' })
  await expect(invite).toBeVisible({ timeout: 15_000 })
  await invite.getByRole('button', { name: 'Abrir el trueque' }).click()
  const arinWindow = arin.getByRole('dialog', { name: 'Trueque con Bea' })
  const beaWindow = bea.getByRole('dialog', { name: 'Trueque con Arin' })
  await expect(beaWindow).toBeVisible()
  await expect(arinWindow).toBeVisible({ timeout: 10_000 })
  await beaWindow.getByRole('button', { name: 'Añadir un objeto' }).click()
  await bea
    .getByRole('dialog', { name: 'Elige qué das' })
    .getByRole('button', { name: 'Dar', exact: true })
    .click()
  // The offer reaches Arin with its long description: the window still reads it.
  const dagger = arinWindow.getByRole('button', { name: 'Daga élfica, ×1' })
  await expect(dagger).toBeVisible({ timeout: 10_000 })
  await dagger.click()
  const sheet = arin.getByRole('dialog', { name: 'Daga élfica' })
  expect(flat(await sheet.locator('.preserve-lines').innerText())).toBe(
    flat(deck.data.es.description),
  )
  expect(await arin.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await capture(arin, `${evidence}/trade-sheet-${info.project.name}.png`, { fullPage: false })
  await arin.keyboard.press('Escape')
  await expect(sheet).toBeHidden()
  expect(errors).toEqual([])
})

test('the library item form sets a rarity and takes the whole text', async ({ page }, info) => {
  await identityFixture(page)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const server = libraryServer({ srd: true, sample: true })
  await server.install(page)
  await page.goto(`./library/${srdLibraryPackId}/item`)
  await page.getByRole('searchbox').fill('espada larga')
  await page.getByRole('link', { name: /^Espada larga/ }).click()
  await expect(page.getByRole('heading', { level: 2, name: 'Espada larga' })).toBeFocused()
  // A mundane item reads as common until a rarity is chosen.
  const rarity = page.getByRole('combobox', { name: 'Rareza' })
  await expect(rarity).toHaveValue('Común')
  await rarity.click()
  await page.getByRole('option', { name: 'Legendario' }).click()
  // The field held 700 characters; a text already over that could only be deleted.
  const spanish = page.getByRole('textbox', { name: 'Descripción en español' })
  await spanish.fill(deck.data.es.description)
  await spanish.press('End')
  await spanish.pressSequentially(' Fin.')
  expect(await spanish.inputValue()).toBe(`${deck.data.es.description} Fin.`)
  // The field grows to a point and then scrolls, so the form below stays in reach.
  expect((await spanish.boundingBox())!.height).toBeLessThan(700)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .include('#main-content')
        .analyze()
    ).violations,
  ).toEqual([])
  await capture(page, `${evidence}/library-form-${info.project.name}.png`)
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: /Guardado/ })).toBeVisible()
  const saved = server.entries().find((e) => e.kind === 'item' && e.key === 'longsword')!
  expect(saved.data).toMatchObject({
    index: { key: 'longsword', rarity: 'legendary' },
    es: { description: `${deck.data.es.description} Fin.` },
  })
})
