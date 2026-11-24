import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { campaignId, identityFixture } from './fixtures/identity.ts'
import { capture, expectTouchTargets, limitMatrix } from './fixtures/audit.ts'
import { adminServer, ironwoodId } from './fixtures/admin.ts'

// RYT-153: the super admin panel. A super admin opens Administration from the account menu,
// finds and favourites campaigns, enters one as DM for two hours and leaves it; favourites appear
// as Supervised in My campaigns. Everyone else never sees it.
async function audit(page: Page, scope = '#main-content') {
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

async function prefer(page: Page, language: string, theme: string) {
  await page.addInitScript(
    ({ language, theme }) => {
      localStorage.setItem('rytta-language', language)
      localStorage.setItem('rytta-theme', theme)
    },
    { language, theme },
  )
}

for (const [language, theme] of [
  ['es', 'default'],
  ['en', 'default'],
  ['es', 'parchment'],
  ['en', 'parchment'],
] as const) {
  test(`RYT-153 a super admin finds, favourites and enters a campaign (${language}, ${theme})`, async ({
    page,
  }, info) => {
    limitMatrix(info, language === 'es' && theme === 'default')
    const es = language === 'es'
    await prefer(page, language, theme)
    await identityFixture(page)
    const server = adminServer()
    await server.install(page)
    await page.goto('./')
    await page.getByRole('button', { name: es ? /Perfil/ : /Profile/ }).click()
    // A super admin edits the library from the panel, so the menu offers only Administration.
    await expect(
      page.getByRole('menuitem', { name: es ? 'Biblioteca de contenido' : 'Content library' }),
    ).toHaveCount(0)
    await page.getByRole('menuitem', { name: es ? 'Administración' : 'Administration' }).click()
    await expect(
      page.getByRole('heading', { level: 1, name: es ? 'Administración' : 'Administration' }),
    ).toBeVisible()
    const list = page.getByRole('list', { name: es ? 'Campañas' : 'Campaigns' })
    await expect(list.getByRole('listitem')).toHaveCount(2)
    await audit(page)
    await capture(page, info.outputPath(`admin-campaigns-${language}-${theme}.png`))

    await page.getByLabel(es ? 'Buscar campaña' : 'Search campaigns').fill('iron')
    await expect(list.getByRole('listitem')).toHaveCount(1)
    const star = list.getByRole('button', {
      name: es ? 'Marcar Ironwood Vale como favorita' : 'Mark Ironwood Vale as a favourite',
    })
    await star.click()
    await expect(
      list.getByRole('button', {
        name: es ? 'Quitar Ironwood Vale de favoritas' : 'Remove Ironwood Vale from favourites',
      }),
    ).toHaveAttribute('aria-pressed', 'true')
    expect(server.calls.some((c) => c.method === 'admin_set_favourite')).toBe(true)

    await list
      .getByRole('button', { name: /Ironwood Vale/ })
      .first()
      .click()
    await expect(page).toHaveURL(new RegExp(`campaign=${ironwoodId}`))
    const enter = page.getByRole('button', {
      name: es ? 'Entrar como DM · 2 horas' : 'Enter as DM · 2 hours',
    })
    await expect(enter).toBeVisible()
    await expect(page.getByText('mara@example.com')).toBeVisible()
    await audit(page)
    await capture(page, info.outputPath(`admin-summary-${language}-${theme}.png`))
    await enter.click()
    await expect(page).toHaveURL(new RegExp(`/campaign/${ironwoodId}`))
    expect(server.calls.filter((c) => c.method === 'admin_enter_campaign')).toHaveLength(1)
  })
}

test('RYT-153 inside a campaign the super admin sees until when and leaves it', async ({
  page,
}, info) => {
  await identityFixture(page)
  const server = adminServer({ access: [campaignId] })
  await server.install(page)
  await page.goto(`./#/campaign/${campaignId}`)
  const banner = page.locator('.admin-banner')
  await expect(banner).toContainText('Administración · eres DM de esta campaña hasta las')
  await expectTouchTargets(banner, 'button:visible')
  await capture(page, info.outputPath('admin-banner.png'))
  // Leaving the campaign is a member's action, never offered through admin access.
  await page.getByRole('button', { name: /Perfil/ }).click()
  await expect(page.getByRole('menuitem', { name: /Abandonar/ })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await banner.getByRole('button', { name: 'Salir' }).click()
  await expect(page).toHaveURL(new RegExp(`/admin\\?tab=campaigns&campaign=${campaignId}`))
  expect(server.calls.filter((c) => c.method === 'admin_exit_campaign')).toHaveLength(1)
  await expect(banner).toHaveCount(0)
})

test('RYT-153 favourites are Supervised in My campaigns, apart from my own', async ({
  page,
}, info) => {
  await identityFixture(page)
  await adminServer({ favourites: [ironwoodId], access: [campaignId] }).install(page)
  await page.goto('./')
  const supervised = page.getByRole('region', { name: 'Supervisadas' })
  await expect(supervised.getByRole('link', { name: /Ironwood Vale/ })).toBeVisible()
  // A campaign entered as admin is not listed as one of mine.
  await expect(page.getByRole('heading', { name: 'Winter at the Keep' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'The Sunken Coast' })).toHaveCount(0)
  await audit(page)
  await capture(page, info.outputPath('admin-supervised.png'))
  await supervised.getByRole('link', { name: /Ironwood Vale/ }).click()
  await expect(page).toHaveURL(new RegExp(`/admin\\?tab=campaigns&campaign=${ironwoodId}`))
})

test('RYT-153 usage, audit and account lookup tabs', async ({ page }, info) => {
  await identityFixture(page)
  await adminServer().install(page)
  await page.goto('./#/admin?tab=usage')
  await expect(page.getByRole('region', { name: 'Uso' }).getByRole('table')).toBeVisible()
  await audit(page)
  await capture(page, info.outputPath('admin-usage.png'))
  await page.getByRole('tab', { name: 'Auditoría' }).click()
  const log = page.getByRole('list', { name: 'Auditoría' })
  await expect(log).toContainText('Salió de Ironwood Vale tras 21 min')
  await expect(log).toContainText('Entró como DM en Ironwood Vale')
  await audit(page)
  await page.getByRole('tab', { name: 'Cuentas' }).click()
  await page.getByLabel('Correo o nombre de usuario').fill('nobody@example.com')
  await page.getByRole('button', { name: 'Buscar', exact: true }).click()
  await expect(page.getByText('No hay ninguna cuenta con ese correo o usuario.')).toBeVisible()
  await page.getByLabel('Correo o nombre de usuario').fill('player@example.com')
  await page.keyboard.press('Enter')
  await expect(page.getByText('arin')).toBeVisible()
  await expect(page.getByText('The Sunken Coast')).toBeVisible()
  await audit(page)
  await capture(page, info.outputPath('admin-accounts.png'))
})

test('RYT-153 anyone else never sees Administration', async ({ page }) => {
  await identityFixture(page)
  await page.goto('./')
  await page.getByRole('button', { name: /Perfil/ }).click()
  await expect(page.getByRole('menuitem', { name: 'Administración' })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await page.goto('./#/admin')
  await expect(page).not.toHaveURL(/#\/admin/)
  await expect(page.getByRole('heading', { level: 1, name: 'Administración' })).toHaveCount(0)
})

test('RYT-153 every tab stays in view and a campaign far down the list opens its summary', async ({
  page,
}) => {
  await identityFixture(page)
  await adminServer({ extra: 24 }).install(page)
  await page.goto('./#/admin')
  for (const name of ['Campañas', 'Biblioteca', 'Uso', 'Auditoría', 'Cuentas'])
    await expect(page.getByRole('tab', { name })).toBeInViewport({ ratio: 1 })
  const list = page.getByRole('list', { name: 'Campañas' })
  await expect(list.getByRole('listitem')).toHaveCount(26)
  await list.getByRole('button', { name: /^Table 24 DM/ }).click()
  const heading = page.getByRole('heading', { level: 2, name: 'Table 24' })
  await expect(heading).toBeFocused()
  await expect(heading).toBeInViewport()
  await expect(page.getByRole('button', { name: 'Entrar como DM · 2 horas' })).toBeInViewport()
})

test('RYT-153 a failed load offers to try again', async ({ page }) => {
  await identityFixture(page)
  await adminServer().install(page)
  let fail = true
  await page.route('**/rest/v1/rpc/admin_list_campaigns', (route) =>
    fail
      ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"boom"}' })
      : route.fallback(),
  )
  await page.goto('./#/admin')
  const alert = page.getByRole('alert')
  await expect(alert).toContainText('No se pudo cargar.')
  fail = false
  await alert.getByRole('button', { name: 'Reintentar' }).click()
  await expect(page.getByRole('list', { name: 'Campañas' }).getByRole('listitem')).toHaveCount(2)
})
