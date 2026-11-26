import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { campaignId, identityFixture } from './fixtures/identity.ts'
import { capture, expectTouchTargets, limitMatrix } from './fixtures/audit.ts'
import { itemPackState, resetItemPacks } from './fixtures/item-packs.ts'
import { homebrewPackId, libraryServer, srdLibraryPackId } from './fixtures/library.ts'
import { storeAction } from './fixtures/storeroom.ts'

// RYT-166 and RYT-163 in both languages and themes: the storeroom import from packs, the library
// item form and the campaigns of a private pack.
const evidence = 'docs/evidence/ui-review/ryt-166'

async function audit(page: Page, scope: string) {
  await page
    .locator(scope)
    .first()
    .evaluate((node) =>
      Promise.all(node.getAnimations({ subtree: true }).map((a) => a.finished.catch(() => null))),
    )
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await expectTouchTargets(page.locator(scope).first(), 'button:visible, a:visible')
  const axe = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .include(scope)
    .analyze()
  expect(axe.violations).toEqual([])
}

for (const [language, theme] of [
  ['es', 'default'],
  ['en', 'default'],
  ['es', 'parchment'],
  ['en', 'parchment'],
] as const)
  test(`RYT-166 import from packs (${language}, ${theme})`, async ({ page }, info) => {
    test.setTimeout(90_000)
    limitMatrix(info, language === 'es' && theme === 'default')
    const es = language === 'es'
    const shot = (name: string) =>
      `${evidence}/${name}-${language}-${theme}-${info.project.name}.png`
    await page.addInitScript(
      ({ language, theme }) => {
        localStorage.setItem('rytta-language', language)
        localStorage.setItem('rytta-theme', theme)
      },
      { language, theme },
    )
    itemPackState.books = true
    try {
      await identityFixture(page, { inventory: true, catalogue: true })
      await page.emulateMedia({ reducedMotion: 'reduce' })
      // The storeroom import: a source filter and the items that differ from their pack.
      await page.goto(`./#/campaign/${campaignId}/members?panel=items`)
      await storeAction(page, 'manage', es)
      await page.getByRole('button', { name: es ? 'Importar objetos' : 'Import items' }).click()
      const drawer = page.getByRole('dialog', { name: es ? 'Importar objetos' : 'Import items' })
      await expect(drawer.getByLabel(es ? 'Fuente' : 'Source')).toBeVisible()
      await expect(drawer.getByRole('checkbox', { name: es ? /Cuerda/ : /Rope/ })).toBeChecked()
      await audit(page, '[role="dialog"]')
      await capture(page, shot('import'))
    } finally {
      resetItemPacks()
    }
  })

for (const [language, theme] of [
  ['es', 'default'],
  ['en', 'default'],
  ['es', 'parchment'],
  ['en', 'parchment'],
] as const)
  test(`RYT-166 library item form and pack campaigns (${language}, ${theme})`, async ({
    page,
  }, info) => {
    test.setTimeout(90_000)
    limitMatrix(info, language === 'es' && theme === 'default')
    const es = language === 'es'
    const shot = (name: string) =>
      `${evidence}/${name}-${language}-${theme}-${info.project.name}.png`
    await page.addInitScript(
      ({ language, theme }) => {
        localStorage.setItem('rytta-language', language)
        localStorage.setItem('rytta-theme', theme)
      },
      { language, theme },
    )
    await identityFixture(page)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    {
      // The library item form.
      const server = libraryServer({ srd: true, sample: true })
      await server.install(page)
      await page.goto(`./#/library/${srdLibraryPackId}/item`)
      await page.getByRole('searchbox').fill(es ? 'espada larga' : 'longsword')
      await page.getByRole('link', { name: es ? /^Espada larga/ : /^Longsword/ }).click()
      await expect(
        page.getByRole('heading', { level: 2, name: es ? 'Espada larga' : 'Longsword' }),
      ).toBeFocused()
      await expect(page.getByRole('group', { name: es ? 'Arma' : 'Weapon' })).toBeVisible()
      await audit(page, '#main-content')
      await capture(page, shot('item-form'))

      // The campaigns of a private pack.
      await page.goto(`./#/library/${homebrewPackId}/spell`)
      await page.getByRole('button', { name: es ? 'Campañas' : 'Campaigns' }).click()
      const offers = page.getByRole('dialog', {
        name: es ? 'Campañas de «Homebrew de la mesa»' : 'Campaigns of “Table homebrew”',
      })
      await offers.getByRole('combobox').click()
      await page.getByRole('option', { name: 'La Costa Hundida' }).click()
      await offers.getByRole('button', { name: es ? 'Añadir' : 'Add', exact: true }).click()
      await expect(
        offers.getByRole('button', {
          name: es ? 'Quitar La Costa Hundida' : 'Remove La Costa Hundida',
        }),
      ).toBeVisible()
      await audit(page, '[role="dialog"]')
      await capture(page, shot('offers'))
    }
  })

// RYT-184: the storeroom search also finds the items of the active packs; the import opens empty.
const storeroomEvidence = 'docs/evidence/RYT-184/storeroom'
for (const [language, theme] of [
  ['es', 'default'],
  ['en', 'default'],
  ['es', 'parchment'],
  ['en', 'parchment'],
] as const)
  test(`RYT-184 storeroom pack finds and the empty import (${language}, ${theme})`, async ({
    page,
  }, info) => {
    test.setTimeout(90_000)
    const es = language === 'es'
    const shot = (name: string) =>
      `${storeroomEvidence}/${name}-${language}-${theme}-${info.project.name}.png`
    await page.addInitScript(
      ({ language, theme }) => {
        localStorage.setItem('rytta-language', language)
        localStorage.setItem('rytta-theme', theme)
      },
      { language, theme },
    )
    itemPackState.books = true
    try {
      await identityFixture(page, { inventory: true, catalogue: true })
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await page.goto(`./#/campaign/${campaignId}/members?panel=items`)
      const search = page.getByRole('searchbox', { name: es ? 'Buscar objetos' : 'Search items' })
      await search.fill(es ? 'esp' : 'sword')
      const group = page.getByRole('region', { name: es ? 'En tus paquetes' : 'In your packs' })
      await expect(group.getByRole('listitem').first()).toBeVisible()
      await audit(page, 'main')
      await capture(page, shot('pack-finds'))
      // 150% text keeps the row whole.
      await page.addStyleTag({ content: 'html { font-size: 150%; }' })
      await audit(page, 'main')
      await capture(page, shot('pack-finds-150'))
      // The import opens with nothing ticked and says what to do.
      await page.reload()
      await storeAction(page, 'manage', es)
      await page.getByRole('button', { name: es ? 'Importar objetos' : 'Import items' }).click()
      const drawer = page.getByRole('dialog', { name: es ? 'Importar objetos' : 'Import items' })
      await expect(
        drawer.getByRole('button', { name: es ? 'Elige una categoría' : 'Choose a category' }),
      ).toBeDisabled()
      await audit(page, '[role="dialog"]')
      await capture(page, shot('import-empty'))
    } finally {
      resetItemPacks()
    }
  })
