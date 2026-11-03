import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const html = (page: Page) => page.locator('html')

test('fresh visits default to Spanish, dark and the default theme despite browser preferences', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('./')
  await expect(html(page)).toHaveAttribute('lang', 'es')
  await expect(html(page)).toHaveAttribute('data-mantine-color-scheme', 'dark')
  await expect(html(page)).toHaveAttribute('data-rytta-theme', 'default')
  await expect(page.getByRole('heading', { name: 'Grupo', exact: true })).toBeVisible()
  await expect(page).toHaveTitle('Grupo · Rytta')
})

test('the profile menu only links to Settings; toggles live on the page', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: /Abrir menú de ajustes/ }).click()
  await expect(page.getByRole('menuitem')).toHaveCount(1)
  await expect(page.getByRole('menuitem', { name: /Cambiar a modo/ })).toHaveCount(0)
  await page.getByRole('menuitem', { name: 'Ajustes', exact: true }).click()
  await expect(page).toHaveURL(/#\/settings$/)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Ajustes', level: 1 })).toBeVisible()
  for (const group of ['Apariencia', 'Tema de clase', 'Idioma'])
    await expect(page.getByRole('radiogroup', { name: group })).toBeVisible()
})

test('appearance, class theme and language persist across navigation and reload', async ({
  page,
}) => {
  await page.goto('./#/settings')
  await page
    .getByRole('radiogroup', { name: 'Apariencia' })
    .getByText('Claro', { exact: true })
    .click()
  await expect(html(page)).toHaveAttribute('data-mantine-color-scheme', 'light')
  await page
    .getByRole('radiogroup', { name: 'Tema de clase' })
    .getByText('Druida', { exact: true })
    .click()
  await expect(html(page)).toHaveAttribute('data-rytta-theme', 'druid')
  await expect(page.getByRole('radio', { name: 'Druida' })).toBeChecked()
  const accent = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--app-accent').trim(),
  )
  expect(accent).toBe('#244b00')
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#eff6ee')
  await page
    .getByRole('radiogroup', { name: 'Idioma' })
    .getByText('English', { exact: true })
    .click()
  await expect(html(page)).toHaveAttribute('lang', 'en')
  await expect(page.getByRole('heading', { name: 'App setup', level: 1 })).toBeVisible()
  await page.goto('./')
  await expect(page.getByRole('heading', { name: 'Party', exact: true })).toBeVisible()
  await page.reload()
  await expect(html(page)).toHaveAttribute('data-mantine-color-scheme', 'light')
  await expect(html(page)).toHaveAttribute('data-rytta-theme', 'druid')
  await expect(html(page)).toHaveAttribute('lang', 'en')
  await page.getByRole('button', { name: /Open settings menu/ }).click()
  await page.getByRole('menuitem', { name: 'App setup', exact: true }).click()
  await expect(page).toHaveTitle('App setup · Rytta')
  await page
    .getByRole('radiogroup', { name: 'Appearance' })
    .getByText('Dark', { exact: true })
    .click()
  await page
    .getByRole('radiogroup', { name: 'Class theme' })
    .getByText('Hearth', { exact: true })
    .click()
  await page
    .getByRole('radiogroup', { name: 'Language' })
    .getByText('Español', { exact: true })
    .click()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Ajustes', exact: true })).toBeVisible()
  await expect(html(page)).toHaveAttribute('data-mantine-color-scheme', 'dark')
  await expect(html(page)).toHaveAttribute('data-rytta-theme', 'default')
  await expect(page.getByRole('radio', { name: 'Español' })).toBeChecked()
})

test('theme gallery is a keyboard radio group with visible focus', async ({ page }) => {
  await page.goto('./#/settings')
  const gallery = page.getByRole('radiogroup', { name: 'Tema de clase' })
  await expect(gallery.getByRole('radio')).toHaveCount(13)
  await gallery.getByRole('radio', { name: 'Hoguera' }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(gallery.getByRole('radio', { name: 'Bárbaro' })).toBeFocused()
  await expect(gallery.getByRole('radio', { name: 'Bárbaro' })).toBeChecked()
  await expect(html(page)).toHaveAttribute('data-rytta-theme', 'barbarian')
  const outline = await page
    .locator('.theme-card', { has: page.getByRole('radio', { name: 'Bárbaro' }) })
    .evaluate((card) => getComputedStyle(card).outlineStyle)
  expect(outline).toBe('solid')
  for (const card of await gallery.locator('label').all()) {
    const box = await card.boundingBox()
    expect(box!.height).toBeGreaterThanOrEqual(44)
    expect(box!.width).toBeGreaterThanOrEqual(44)
  }
  await page.keyboard.press('Tab')
  await expect(page.getByRole('radio', { name: 'Español' })).toBeFocused()
})

for (const language of ['es', 'en'] as const) {
  for (const scheme of ['dark', 'light'] as const) {
    for (const theme of ['default', 'warlock'] as const)
      test(`${language} ${scheme} ${theme} overview and settings are accessible and fit`, async ({
        page,
      }, testInfo) => {
        await page.addInitScript(
          ({ language, scheme, theme }) => {
            localStorage.setItem('rytta-language', language)
            localStorage.setItem('rytta-color-scheme', scheme)
            localStorage.setItem('rytta-theme', theme)
          },
          { language, scheme, theme },
        )
        for (const route of ['', '#/settings']) {
          await page.goto(`./${route}`)
          await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
          await expect(html(page)).toHaveAttribute('data-rytta-theme', theme)
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          ).toBe(true)
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
            path: testInfo.outputPath(
              `${language}-${scheme}-${theme}-${route ? 'settings' : 'party'}.png`,
            ),
            fullPage: true,
            scale: 'css',
          })
        }
        await page.addStyleTag({ content: 'html { font-size: 150%; }' })
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        )
        for (const label of await page.locator('.choice-label').all())
          expect(
            await label.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
            'Choice labels stay readable at 150% text',
          ).toBe(true)
      })
  }
}

test('every class theme passes axe on the settings page in both schemes', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Theme colors do not depend on the viewport')
  test.slow()
  await page.goto('./#/settings')
  await expect(page.getByRole('heading', { name: 'Ajustes', level: 1 })).toBeVisible()
  const ids = await page
    .getByRole('radiogroup', { name: 'Tema de clase' })
    .getByRole('radio')
    .evaluateAll((radios) => radios.map((radio) => (radio as HTMLInputElement).value))
  expect(ids).toHaveLength(13)
  for (const scheme of ['Oscuro', 'Claro']) {
    await page.getByRole('radiogroup', { name: 'Apariencia' }).getByText(scheme).click()
    for (const id of ids) {
      await page.locator('label.theme-card', { has: page.locator(`input[value="${id}"]`) }).click()
      await expect(html(page)).toHaveAttribute('data-rytta-theme', id)
      const audit = await new AxeBuilder({ page }).withTags(['wcag2aa']).analyze()
      expect(audit.violations.map((v) => `${scheme} ${id}: ${v.id}`)).toEqual([])
    }
  }
})

test('invalid preferences recover to defaults', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('rytta-language', 'unknown')
    localStorage.setItem('rytta-color-scheme', 'unknown')
    localStorage.setItem('rytta-theme', 'artificer')
  })
  await page.goto('./#/missing')
  await expect(
    page.getByRole('heading', { name: 'Página no encontrada', exact: true }),
  ).toBeVisible()
  await expect(html(page)).toHaveAttribute('lang', 'es')
  await expect(html(page)).toHaveAttribute('data-mantine-color-scheme', 'dark')
  await expect(html(page)).toHaveAttribute('data-rytta-theme', 'default')
})

test('blocked storage does not prevent changing language, appearance or theme', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => {
      throw new DOMException('Blocked', 'SecurityError')
    }
    Storage.prototype.setItem = () => {
      throw new DOMException('Blocked', 'SecurityError')
    }
  })
  await page.goto('./#/settings')
  await expect(page.getByRole('heading', { name: 'Ajustes', exact: true })).toBeVisible()
  await page
    .getByRole('radiogroup', { name: 'Apariencia' })
    .getByText('Claro', { exact: true })
    .click()
  await page
    .getByRole('radiogroup', { name: 'Tema de clase' })
    .getByText('Mago', { exact: true })
    .click()
  await page
    .getByRole('radiogroup', { name: 'Idioma' })
    .getByText('English', { exact: true })
    .click()
  await expect(page.getByRole('heading', { name: 'App setup', exact: true })).toBeVisible()
  await expect(html(page)).toHaveAttribute('data-mantine-color-scheme', 'light')
  await expect(html(page)).toHaveAttribute('data-rytta-theme', 'wizard')
  expect(errors).toEqual([])
})
