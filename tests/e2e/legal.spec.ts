import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { identityFixture } from './fixtures/identity.ts'
import { capture } from './fixtures/audit.ts'

/** RYT-115: the privacy policy and terms are public hash routes. Demo projects run the page
 * checks; the identity projects add the signed-out landing and the signed-in account. */
const identity = (name: string) => name.startsWith('identity')
const noOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)

const pages = [
  {
    route: 'privacy',
    es: ['Política de privacidad', 'Qué datos recogemos', 'dirección de contacto pendiente'],
    en: ['Privacy policy', 'What we collect', 'contact address pending'],
  },
  {
    route: 'terms',
    es: ['Condiciones de uso', 'Uso aceptable', 'Ley aplicable'],
    en: ['Terms of use', 'Acceptable use', 'Governing law'],
  },
] as const

for (const language of ['es', 'en'] as const)
  for (const doc of pages)
    test(`${doc.route} reads in ${language}, passes axe and fits`, async ({ page }, testInfo) => {
      await page.addInitScript(
        (language) => localStorage.setItem('rytta-language', language),
        language,
      )
      if (identity(testInfo.project.name)) await identityFixture(page, { signedIn: false })
      await page.goto(`./#/${doc.route}`)
      const [title, heading, text] = doc[language]
      await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible()
      await expect(page.getByRole('heading', { level: 2, name: heading })).toBeVisible()
      await expect(page.locator('.legal')).toContainText(text)
      // Approved: no draft note, and the date reads as in force.
      await expect(page.getByRole('note')).toHaveCount(0)
      await expect(page.locator('.legal')).not.toContainText(/Borrador|Draft/)
      await expect(page.locator('.legal-date')).toContainText(
        language === 'es'
          ? 'En vigor desde el 26 de noviembre de 2026'
          : 'In force since November 26, 2026',
      )
      await expect(page).toHaveTitle(`${title} · Rytta`)
      await expect(page.locator('html')).toHaveAttribute('lang', language)
      expect(await noOverflow(page)).toBe(true)
      const audit = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()
      expect(audit.violations.map((v) => v.id)).toEqual([])
      await capture(page, testInfo.outputPath(`${doc.route}-${language}.png`))
    })

test('the terms quote the SRD licence string the glossary uses', async ({ page }) => {
  await page.goto('./#/terms')
  await expect(page.locator('.legal blockquote')).toContainText('SRD 5.2.1')
  await expect(page.locator('.legal blockquote')).toContainText('Creative Commons')
})

test('the privacy page links to the terms and back', async ({ page }) => {
  await page.goto('./#/privacy')
  await page.getByRole('link', { name: /Leer las condiciones de uso/ }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Condiciones de uso' })).toBeVisible()
  await page.getByRole('link', { name: 'Volver' }).click()
  await expect(
    page.getByRole('heading', { level: 1, name: 'Política de privacidad' }),
  ).toBeVisible()
})

test('Settings links to both pages and leaves the drawer behind', async ({ page }, testInfo) => {
  if (identity(testInfo.project.name)) await identityFixture(page)
  await page.goto('./')
  if (identity(testInfo.project.name)) {
    await page.getByRole('button', { name: /Perfil/ }).click()
    await page.getByRole('menuitem', { name: 'Ajustes', exact: true }).click()
  } else await page.getByRole('button', { name: 'Ajustes', exact: true }).click()
  const settings = page.getByRole('dialog', { name: 'Ajustes' })
  await expect(settings).toHaveCSS('opacity', '1')
  await expect(settings.getByRole('link', { name: 'Condiciones de uso' })).toBeVisible()
  await settings.getByRole('link', { name: 'Política de privacidad' }).click()
  await expect(page).toHaveURL(/#\/privacy$/)
  await expect(
    page.getByRole('heading', { level: 1, name: 'Política de privacidad' }),
  ).toBeVisible()
  await expect(settings).toBeHidden()
  // Focus follows the link to the page heading, not back to the header.
  await expect(
    page.getByRole('heading', { level: 1, name: 'Política de privacidad' }),
  ).toBeFocused()
})

test('the approved text shows the effective date, not a draft', async ({ page }) => {
  await page.goto('./#/privacy')
  await expect(page.locator('.legal-date')).toContainText(
    'En vigor desde el 26 de noviembre de 2026',
  )
  await expect(page.locator('.legal-date')).not.toContainText('Borrador')
  await expect(page.locator('.legal-draft')).toHaveCount(0)
  await expect(page.locator('.legal-date time')).toHaveAttribute('datetime', '2026-11-26')
  // The e2e builds publish no owner name and no contact address.
  await expect(page.locator('#legal-who + p')).toContainText(
    'El responsable se identificará antes del lanzamiento',
  )
  await expect(page.locator('#legal-who + p')).toContainText('se publicará antes del lanzamiento')
  await expect(page.locator('#legal-who + p a')).toHaveCount(0)
})

test('both documents state the minimum age of 14', async ({ page }) => {
  await page.goto('./#/privacy')
  await expect(page.getByRole('heading', { level: 2, name: 'Edad mínima' })).toBeVisible()
  await expect(page.locator('#legal-age + p')).toContainText('14 años')
  await page.goto('./#/terms')
  await expect(page.locator('#legal-age + p')).toContainText('al menos 14 años')
  await expect(page.locator('#legal-law + p')).toContainText('ley española')
})

test('the signed-out landing links to both pages', async ({ page }, testInfo) => {
  test.skip(!identity(testInfo.project.name), 'The landing exists only in the signed-in build')
  await identityFixture(page, { signedIn: false })
  await page.goto('./')
  // The boot screen of index.html carries static links with the same name until the app renders;
  // the landing's own links are the ones under test.
  await expect(page.getByRole('button', { name: 'Continuar con Google' })).toBeVisible()
  await expect(page.locator('.boot-legal')).toHaveCount(0)
  const links = page.getByRole('navigation', { name: 'Privacidad y condiciones' })
  await expect(links.getByRole('link')).toHaveCount(2)
  // Polled: the landing lays the links out after its styles load.
  const first = links.getByRole('link').first()
  await expect
    .poll(() => first.evaluate((el) => el.getBoundingClientRect().height))
    .toBeGreaterThanOrEqual(44)
  await links.getByRole('link', { name: 'Condiciones de uso' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Condiciones de uso' })).toBeVisible()
  // The visitor came from the landing, so Back returns there.
  await page.getByRole('link', { name: 'Volver' }).click()
  await expect(page.getByRole('button', { name: 'Continuar con Google' })).toBeVisible()
})

test('a signed-in account reads the policy and the title follows the page', async ({
  page,
}, testInfo) => {
  test.skip(!identity(testInfo.project.name), 'Signed-in accounts exist only in the identity build')
  await identityFixture(page)
  await page.goto('./#/privacy')
  await expect(
    page.getByRole('heading', { level: 1, name: 'Política de privacidad' }),
  ).toBeVisible()
  await expect(page).toHaveTitle('Política de privacidad · Rytta')
})
