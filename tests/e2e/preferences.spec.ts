import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { capture, expectTouchTargets, limitMatrix } from './fixtures/audit.ts'

const html = (page: Page) => page.locator('html')
/** RYT-069: Settings is a right-hand drawer; `#/settings` links still open it. */
const drawer = (page: Page, name = 'Ajustes') => page.getByRole('dialog', { name })

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

test('the profile menu opens the Settings drawer over the page; toggles live there', async ({
  page,
}) => {
  await page.goto('./')
  const trigger = page.getByRole('button', { name: /Abrir menú de ajustes/ })
  await trigger.click()
  await expect(page.getByRole('menuitem')).toHaveCount(1)
  await expect(page.getByRole('menuitem', { name: /Cambiar a modo/ })).toHaveCount(0)
  await page.getByRole('menuitem', { name: 'Ajustes', exact: true }).click()
  const settings = drawer(page)
  await expect(settings).toBeVisible()
  // The page stays underneath: same route, same heading, and the panel sits on the right.
  await expect(page).toHaveURL(/#\/party$/)
  await expect(page.getByRole('heading', { name: 'Grupo', exact: true })).toBeAttached()
  // Measure once the panel has slid in, against the veil: both are fixed to the same box (the
  // viewport minus the stable scrollbar gutter that desktop browsers keep).
  await expect(settings).toHaveCSS('opacity', '1')
  const veil = page.locator('.settings-drawer .mantine-Drawer-overlay')
  await expect
    .poll(async () => {
      const [panel, page] = [await settings.boundingBox(), await veil.boundingBox()]
      return Math.round(page!.x + page!.width - (panel!.x + panel!.width))
    })
    .toBe(0)
  const box = (await settings.boundingBox())!
  const width = (await veil.boundingBox())!.width
  expect(box.width).toBeLessThanOrEqual(481)
  expect(box.width).toBeLessThan(width)
  // RYT-069: language first, then the theme; the theme carries its own scheme.
  await expect(settings.getByRole('radiogroup')).toHaveCount(2)
  const groups = await settings
    .getByRole('radiogroup')
    .evaluateAll((list) => list.map((el) => el.getAttribute('class')))
  expect(groups).toEqual(['language-picker', 'theme-picker'])
  for (const group of ['Tema', 'Idioma'])
    await expect(settings.getByRole('radiogroup', { name: group })).toBeVisible()
  const themes = settings.getByRole('radiogroup', { name: 'Tema' })
  await expect(themes.getByRole('group', { name: 'Oscuros' }).getByRole('radio')).toHaveCount(10)
  await expect(themes.getByRole('group', { name: 'Claros' }).getByRole('radio')).toHaveCount(4)
  await page.keyboard.press('Escape')
  await expect(settings).toBeHidden()
  await expect(trigger).toBeFocused()
})

test('theme (with its scheme) and language persist across navigation and reload', async ({
  page,
}) => {
  await page.goto('./#/settings')
  const themes = drawer(page).getByRole('radiogroup', { name: 'Tema' })
  const accent = () =>
    page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--app-accent').trim(),
    )
  await themes.getByText('Druida', { exact: true }).click()
  await expect(html(page)).toHaveAttribute('data-rytta-theme', 'druid')
  await expect(html(page)).toHaveAttribute('data-mantine-color-scheme', 'dark')
  await expect(page.getByRole('radio', { name: 'Druida' })).toBeChecked()
  expect(await accent()).toBe('#8cc36d')
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#0c110b')
  await themes.getByText('Mago', { exact: true }).click()
  await expect(html(page)).toHaveAttribute('data-rytta-theme', 'wizard')
  await expect(html(page)).toHaveAttribute('data-mantine-color-scheme', 'light')
  expect(await accent()).toBe('#224fa7')
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#eff4fc')
  await drawer(page)
    .getByRole('radiogroup', { name: 'Idioma' })
    .getByText('English', { exact: true })
    .click()
  await expect(html(page)).toHaveAttribute('lang', 'en')
  await expect(drawer(page, 'App setup')).toBeVisible()
  await page.goto('./')
  await expect(page.getByRole('heading', { name: 'Party', exact: true })).toBeVisible()
  await page.reload()
  await expect(html(page)).toHaveAttribute('data-mantine-color-scheme', 'light')
  await expect(html(page)).toHaveAttribute('data-rytta-theme', 'wizard')
  await expect(html(page)).toHaveAttribute('lang', 'en')
  await page.getByRole('button', { name: /Open settings menu/ }).click()
  await page.getByRole('menuitem', { name: 'App setup', exact: true }).click()
  const setup = drawer(page, 'App setup')
  await setup
    .getByRole('radiogroup', { name: 'Theme' })
    .getByText('Hearth', { exact: true })
    .click()
  await setup
    .getByRole('radiogroup', { name: 'Language' })
    .getByText('Español', { exact: true })
    .click()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Grupo', exact: true })).toBeVisible()
  await expect(html(page)).toHaveAttribute('data-mantine-color-scheme', 'dark')
  await expect(html(page)).toHaveAttribute('data-rytta-theme', 'default')
  await page.goto('./#/settings')
  await expect(drawer(page).getByRole('radio', { name: 'Español' })).toBeChecked()
})

test('a legacy light preference becomes Parchment; classes keep their class', async ({ page }) => {
  await page.goto('./')
  const setLegacy = (theme: string | null) =>
    page.evaluate((theme) => {
      localStorage.setItem('rytta-color-scheme', 'light')
      if (theme) localStorage.setItem('rytta-theme', theme)
      else localStorage.removeItem('rytta-theme')
    }, theme)
  await setLegacy(null)
  await page.reload()
  await expect(html(page)).toHaveAttribute('data-rytta-theme', 'parchment')
  await expect(html(page)).toHaveAttribute('data-mantine-color-scheme', 'light')
  // Wait for the app to mount (the router must be listening) before changing the hash.
  await expect(page.getByRole('heading', { name: 'Grupo', exact: true })).toBeVisible()
  await page.goto('./#/settings')
  await expect(drawer(page).getByRole('radio', { name: 'Pergamino' })).toBeChecked()
  // An explicit choice retires the legacy key, so Hearth stays Hearth after a reload.
  await drawer(page)
    .getByRole('radiogroup', { name: 'Tema' })
    .getByText('Hoguera', { exact: true })
    .click()
  await expect(html(page)).toHaveAttribute('data-mantine-color-scheme', 'dark')
  await page.reload()
  await expect(html(page)).toHaveAttribute('data-rytta-theme', 'default')
  await expect(html(page)).toHaveAttribute('data-mantine-color-scheme', 'dark')
  await setLegacy('druid')
  await page.reload()
  await expect(html(page)).toHaveAttribute('data-rytta-theme', 'druid')
  await expect(html(page)).toHaveAttribute('data-mantine-color-scheme', 'dark')
})

test('theme picker is one keyboard radio group across both schemes, with visible focus', async ({
  page,
}) => {
  await page.goto('./#/settings')
  const picker = drawer(page).getByRole('radiogroup', { name: 'Tema' })
  await expect(picker.getByRole('radio')).toHaveCount(14)
  // The drawer places its initial focus on the close button once it has opened; start after it.
  await expect(drawer(page).getByRole('button', { name: 'Cerrar ajustes' })).toBeFocused()
  await picker.getByRole('radio', { name: 'Hoguera' }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(picker.getByRole('radio', { name: 'Bardo' })).toBeFocused()
  await expect(picker.getByRole('radio', { name: 'Bardo' })).toBeChecked()
  await expect(html(page)).toHaveAttribute('data-rytta-theme', 'bard')
  // Arrow keys cross from the dark group into the light one; the scheme follows the theme.
  await picker.getByRole('radio', { name: 'Hechicero' }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(picker.getByRole('radio', { name: 'Pergamino' })).toBeFocused()
  await expect(html(page)).toHaveAttribute('data-rytta-theme', 'parchment')
  await expect(html(page)).toHaveAttribute('data-mantine-color-scheme', 'light')
  const outline = await page
    .locator('.theme-card', { has: page.getByRole('radio', { name: 'Pergamino' }) })
    .evaluate((card) => getComputedStyle(card).outlineStyle)
  expect(outline).toBe('solid')
  await expectTouchTargets(picker, 'label', { height: 44, width: 44 })
  // Language comes first in the drawer, so Shift+Tab leaves the theme group for it.
  await page.keyboard.press('Shift+Tab')
  await expect(drawer(page).getByRole('radio', { name: 'Español' })).toBeFocused()
})

for (const language of ['es', 'en'] as const) {
  for (const theme of ['default', 'parchment', 'warlock', 'rogue'] as const)
    test(`${language} ${theme} overview and settings are accessible and fit`, async ({
      page,
    }, testInfo) => {
      limitMatrix(testInfo, language === 'es' && theme === 'default')
      await page.addInitScript(
        ({ language, theme }) => {
          localStorage.setItem('rytta-language', language)
          localStorage.setItem('rytta-theme', theme)
        },
        { language, theme },
      )
      const scheme = theme === 'parchment' || theme === 'warlock' ? 'light' : 'dark'
      for (const route of ['', '#/settings']) {
        await page.goto(`./${route}`)
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
        // Audit once the drawer has finished sliding in (its opacity animates from 0).
        if (route)
          await expect(drawer(page, language === 'es' ? 'Ajustes' : 'App setup')).toHaveCSS(
            'opacity',
            '1',
          )
        await expect(html(page)).toHaveAttribute('data-rytta-theme', theme)
        await expect(html(page)).toHaveAttribute('data-mantine-color-scheme', scheme)
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        )
        // With the drawer open, the page behind it is dimmed by the modal overlay and audited
        // on its own in the first pass; audit the dialog the user is working in.
        const builder = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        const audit = await (route ? builder.include('[role="dialog"]') : builder).analyze()
        expect(
          audit.violations.map((v) => ({
            id: v.id,
            nodes: v.nodes.map((n) => ({ target: n.target, failure: n.failureSummary })),
          })),
        ).toEqual([])
        await capture(
          page,
          testInfo.outputPath(`${language}-${theme}-${route ? 'settings' : 'party'}.png`),
          { scale: 'css' },
        )
      }
      await page.addStyleTag({ content: 'html { font-size: 150%; }' })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      )
      expect(
        await page
          .locator('.choice-label')
          .evaluateAll((labels) => labels.every((el) => el.scrollWidth <= el.clientWidth + 1)),
        'Choice labels stay readable at 150% text',
      ).toBe(true)
    })
}

test('every theme passes axe on the settings drawer in its own scheme', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Theme colors do not depend on the viewport')
  test.slow()
  // Tiles cross-fade their colors on change; reduced motion removes the fade so axe reads the
  // settled colors.
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('./#/settings')
  await expect(drawer(page)).toHaveCSS('opacity', '1')
  const picker = drawer(page).getByRole('radiogroup', { name: 'Tema' })
  await expect(picker).toBeVisible()
  for (const [group, scheme, count] of [
    ['Oscuros', 'dark', 10],
    ['Claros', 'light', 4],
  ] as const) {
    const ids = await picker
      .getByRole('group', { name: group })
      .getByRole('radio')
      .evaluateAll((radios) => radios.map((radio) => (radio as HTMLInputElement).value))
    expect(ids).toHaveLength(count)
    for (const id of ids) {
      await page.locator('label.theme-card', { has: page.locator(`input[value="${id}"]`) }).click()
      await expect(html(page)).toHaveAttribute('data-rytta-theme', id)
      await expect(html(page)).toHaveAttribute('data-mantine-color-scheme', scheme)
      // Themes only swap color tokens; the full rule set runs in the per-screen audits. The page
      // behind the modal overlay is dimmed on purpose, so only the drawer is measured.
      const audit = await new AxeBuilder({ page })
        .include('[role="dialog"]')
        .withRules(['color-contrast'])
        .analyze()
      expect(audit.violations.map((v) => `${id}: ${v.id}`)).toEqual([])
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

test('blocked storage does not prevent changing language or theme', async ({ page }) => {
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
  await drawer(page)
    .getByRole('radiogroup', { name: 'Tema' })
    .getByText('Mago', { exact: true })
    .click()
  await drawer(page)
    .getByRole('radiogroup', { name: 'Idioma' })
    .getByText('English', { exact: true })
    .click()
  await expect(drawer(page, 'App setup')).toBeVisible()
  await expect(html(page)).toHaveAttribute('data-mantine-color-scheme', 'light')
  await expect(html(page)).toHaveAttribute('data-rytta-theme', 'wizard')
  expect(errors).toEqual([])
})
