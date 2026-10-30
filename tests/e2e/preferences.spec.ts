import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test('fresh visits default to Spanish and dark despite browser preferences', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('./')
  await expect(page.locator('html')).toHaveAttribute('lang', 'es')
  await expect(page.locator('html')).toHaveAttribute('data-mantine-color-scheme', 'dark')
  await expect(
    page.getByRole('heading', { name: 'Toda aventura empieza alrededor de una mesa.' }),
  ).toBeVisible()
  await expect(page).toHaveTitle('Campamento · Rytta')
})

test('theme and language persist across navigation and reload and can be changed back', async ({
  page,
}) => {
  await page.goto('./')
  await page.getByRole('button', { name: /ES · Cambiar idioma a inglés/ }).click()
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await page.getByRole('button', { name: /EN · Switch language to Spanish/ }).click()
  await expect(page.locator('html')).toHaveAttribute('lang', 'es')
  await page.getByRole('button', { name: 'Cambiar a modo claro' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-mantine-color-scheme', 'light')
  await page.getByRole('button', { name: 'Cambiar a modo oscuro' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-mantine-color-scheme', 'dark')
  await page.getByRole('button', { name: /Abrir menú de ajustes/ }).click()
  await page.getByRole('menuitem', { name: 'Ajustes', exact: true }).click()
  await page
    .getByRole('dialog')
    .locator('label')
    .filter({ hasText: /^Claro$/ })
    .click()
  await page.getByRole('dialog').getByRole('combobox', { name: 'Idioma' }).selectOption('en')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('heading', { name: /Every adventure starts/ })).toBeVisible()
  await page.getByRole('link', { name: 'Explore the party' }).click()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Party', exact: true })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('data-mantine-color-scheme', 'light')
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await page.goto('./#/settings')
  await expect(page).toHaveTitle('App setup · Rytta')
  await page
    .getByRole('radiogroup', { name: 'Appearance' })
    .locator('label')
    .filter({ hasText: /^Dark$/ })
    .click()
  await page.locator('main').getByRole('combobox', { name: 'Language' }).selectOption('es')
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Ajustes', exact: true })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('data-mantine-color-scheme', 'dark')
  await expect(page.locator('main').getByRole('combobox', { name: 'Idioma' })).toHaveValue('es')
})

for (const language of ['es', 'en'] as const) {
  for (const scheme of ['dark', 'light'] as const) {
    test(`${language} ${scheme} overview and settings are accessible and fit`, async ({
      page,
    }, testInfo) => {
      await page.addInitScript(
        ({ language, scheme }) => {
          localStorage.setItem('rytta-language', language)
          localStorage.setItem('rytta-color-scheme', scheme)
        },
        { language, scheme },
      )
      for (const route of ['', '#/settings']) {
        await page.goto(`./${route}`)
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        )
        const audit = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
          .analyze()
        expect(
          audit.violations.map((v) => ({
            id: v.id,
            nodes: v.nodes.map((n) => ({ target: n.target, failure: n.failureSummary })),
          })),
        ).toEqual([])
        await page.screenshot({
          path: testInfo.outputPath(`${language}-${scheme}-${route ? 'settings' : 'camp'}.png`),
          fullPage: true,
          scale: 'css',
        })
      }
      await page.addStyleTag({ content: 'html { font-size: 150%; }' })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      )
      const languageTextFits = await page.locator('main select').evaluate((select) => {
        const input = select as HTMLSelectElement
        const style = getComputedStyle(input)
        const context = document.createElement('canvas').getContext('2d')!
        context.font = style.font
        const textWidth = context.measureText(input.selectedOptions[0].text).width
        const availableWidth =
          input.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
        return textWidth <= availableWidth
      })
      expect(languageTextFits, 'Selected language remains readable at 150% text').toBe(true)
    })
  }
}

test('invalid preferences recover to defaults', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('rytta-language', 'unknown')
    localStorage.setItem('rytta-color-scheme', 'unknown')
  })
  await page.goto('./#/missing')
  await expect(
    page.getByRole('heading', { name: 'Página no encontrada', exact: true }),
  ).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('lang', 'es')
  await expect(page.locator('html')).toHaveAttribute('data-mantine-color-scheme', 'dark')
})

test('blocked storage does not prevent changing language or theme', async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => {
      throw new DOMException('Blocked', 'SecurityError')
    }
    Storage.prototype.setItem = () => {
      throw new DOMException('Blocked', 'SecurityError')
    }
  })
  await page.goto('./')
  await expect(page.getByRole('heading', { name: /Toda aventura/ })).toBeVisible()
  await page.getByRole('button', { name: /Abrir menú de ajustes/ }).click()
  await page.getByRole('menuitem', { name: 'Ajustes', exact: true }).click()
  await page
    .getByRole('dialog')
    .locator('label')
    .filter({ hasText: /^Claro$/ })
    .click()
  await page.getByRole('dialog').getByRole('combobox', { name: 'Idioma' }).selectOption('en')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('heading', { name: /Every adventure/ })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('data-mantine-color-scheme', 'light')
})
