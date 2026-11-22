import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { identityFixture } from './fixtures/identity.ts'
import { capture, expectTouchTargets, limitMatrix } from './fixtures/audit.ts'

// RYT-148: an account with no campaign and no invitation says which account is signed in, copies
// it for the DM and switches account in one action.
async function axeClean(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
  expect(audit.violations.map((v) => v.id)).toEqual([])
}

for (const [language, theme] of [
  ['es', 'default'],
  ['en', 'default'],
  ['es', 'parchment'],
  ['en', 'parchment'],
] as const) {
  test(`RYT-148 an uninvited account sees which account it is and switches it (${language}, ${theme})`, async ({
    page,
  }, info) => {
    limitMatrix(info, language === 'es' && theme === 'default')
    const es = language === 'es'
    await page.addInitScript(
      ({ language, theme }) => {
        localStorage.setItem('rytta-language', language)
        localStorage.setItem('rytta-theme', theme)
      },
      { language, theme },
    )
    await identityFixture(page, { empty: true })
    await page.route('**/rest/v1/rpc/list_my_invitations', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
    )
    await page.goto('./')
    const empty = page.locator('.hub-empty')
    await expect(empty).toContainText(es ? 'Aún no tienes campañas' : 'You have no campaigns yet')
    await expect(empty).toContainText(es ? 'Has entrado como' : 'Signed in as')
    await expect(empty).toContainText('dm@example.com')
    await expect(
      empty.getByRole('button', { name: es ? 'Copiar correo' : 'Copy email' }),
    ).toBeVisible()
    const switchAccount = empty.getByRole('button', {
      name: es ? 'Cambiar de cuenta' : 'Switch account',
    })
    await expect(switchAccount).toBeVisible()
    // These builds publish no contact address, so no contact link is offered.
    await expect(empty.getByRole('link')).toHaveCount(0)
    await expectTouchTargets(empty, 'button:visible')
    await axeClean(page)
    await capture(page, info.outputPath(`uninvited-${language}-${theme}.png`))
    // Keyboard: Tab reaches the switch, Enter signs out and lands on the sign-in page.
    await switchAccount.focus()
    await page.keyboard.press('Enter')
    await expect(
      page.getByRole('button', { name: es ? 'Continuar con Google' : 'Continue with Google' }),
    ).toBeVisible()
    await expect(empty).toHaveCount(0)
  })
}
