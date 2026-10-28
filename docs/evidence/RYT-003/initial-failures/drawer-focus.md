# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: characters.spec.ts >> Player sees own resources read-only; account menu returns home without leaving membership
- Location: tests\e2e\characters.spec.ts:51:1

# Error details

```
Error: expect(locator).toBeFocused() failed

Locator:  getByRole('button', { name: 'Abrir menú de cuenta y ajustes' })
Expected: focused
Received: inactive
Timeout:  5000ms

Call log:
  - Expect "toBeFocused" getByRole('button', { name: 'Abrir menú de cuenta y ajustes' }) with timeout 5000ms
  - waiting for getByRole('button', { name: 'Abrir menú de cuenta y ajustes' })
    14 × locator resolved to <button type="button" data-variant="subtle" aria-expanded="false" aria-controls="account-drawer" aria-label="Abrir menú de cuenta y ajustes" class="mantine-focus-auto mantine-active account-menu m_8d3f4000 mantine-ActionIcon-root m_87cf2631 mantine-UnstyledButton-root">…</button>
       - unexpected value "inactive"

```

```yaml
- button "Abrir menú de cuenta y ajustes"
```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test'
  2   | import AxeBuilder from '@axe-core/playwright'
  3   | import { identityFixture, campaignId } from './fixtures/identity.ts'
  4   |
  5   | test('DM creates before assignment, invites, edits whole homebrew units and recovers from a stale editor', async ({
  6   |   page,
  7   | }) => {
  8   |   const f = await identityFixture(page)
  9   |   await page.goto(`./#/campaign/${campaignId}/party`)
  10  |   const create = page.getByRole('button', { name: 'Crear personaje', exact: true })
  11  |   await create.click()
  12  |   await expect(page.getByLabel('Nombre del personaje')).toBeFocused()
  13  |   await page.keyboard.press('Escape')
  14  |   await expect(create).toBeFocused()
  15  |   await create.click()
  16  |   await page.getByLabel('Nombre del personaje').fill('New hero')
  17  |   await page
  18  |     .getByRole('dialog')
  19  |     .getByRole('button', { name: 'Crear personaje', exact: true })
  20  |     .click()
  21  |   const card = page
  22  |     .locator('.character-card')
  23  |     .filter({ has: page.getByRole('heading', { name: 'New hero' }) })
  24  |   await expect(card.getByText('Sin jugador')).toBeVisible()
  25  |   await card.getByRole('button', { name: 'Invitar jugador' }).click()
  26  |   await page.getByLabel('Correo de la cuenta de Google').fill('future@example.com')
  27  |   await page.getByRole('dialog').getByRole('button', { name: 'Invitar jugador' }).click()
  28  |   await expect(page.getByRole('status')).toContainText('Invitación creada')
  29  |   expect(
  30  |     f.calls.find((c) => c.method === 'invite_character_player')?.body.target_character,
  31  |   ).toBeTruthy()
  32  |   const arin = page
  33  |     .locator('.character-card')
  34  |     .filter({ has: page.getByRole('heading', { name: 'Arin', exact: true }) })
  35  |   await arin.getByRole('button', { name: 'Editar recursos' }).click()
  36  |   await page.getByRole('textbox', { name: 'Oro', exact: true }).fill('99')
  37  |   await page.getByRole('textbox', { name: 'Agotamiento', exact: true }).fill('12')
  38  |   await page.getByRole('button', { name: 'Guardar recursos' }).click()
  39  |   await expect(arin.getByText('99', { exact: true })).toBeVisible()
  40  |   await arin.getByRole('button', { name: 'Editar recursos' }).click()
  41  |   f.staleResources()
  42  |   await page.getByRole('textbox', { name: 'Oro', exact: true }).fill('100')
  43  |   await page.getByRole('button', { name: 'Guardar recursos' }).click()
  44  |   await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Otro DM')
  45  |   await expect(page.getByRole('button', { name: 'Guardar recursos' })).toBeDisabled()
  46  |   await page.keyboard.press('Escape')
  47  |   await page.getByRole('button', { name: 'Actualizar', exact: true }).click()
  48  |   await expect(arin.getByText('70', { exact: true })).toBeVisible()
  49  | })
  50  |
  51  | test('Player sees own resources read-only; account menu returns home without leaving membership', async ({
  52  |   page,
  53  | }) => {
  54  |   const f = await identityFixture(page, { player: true })
  55  |   await page.goto(`./#/campaign/${campaignId}/party`)
  56  |   await expect(page.getByText('Tu personaje', { exact: true })).toBeVisible()
  57  |   await expect(page.getByRole('button', { name: 'Editar recursos' })).toHaveCount(0)
  58  |   await expect(page.getByRole('button', { name: 'Crear personaje' })).toHaveCount(0)
  59  |   const menu = page.getByRole('button', { name: 'Abrir menú de cuenta y ajustes' })
  60  |   await menu.click()
  61  |   await page.keyboard.press('Escape')
> 62  |   await expect(menu).toBeFocused()
      |                      ^ Error: expect(locator).toBeFocused() failed
  63  |   await menu.press('Enter')
  64  |   await page.getByRole('dialog').getByRole('link', { name: 'Sesión de player@example.com' }).click()
  65  |   await expect(page.getByRole('heading', { name: 'Mis campañas', exact: true })).toBeVisible()
  66  |   expect(f.calls.filter((c) => c.method === 'change_campaign_member')).toHaveLength(0)
  67  |   await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click()
  68  |   await expect(page.getByRole('button', { name: 'Continuar con Google' })).toBeVisible()
  69  | })
  70  |
  71  | for (const language of ['es', 'en'] as const)
  72  |   for (const scheme of ['dark', 'light'] as const)
  73  |     test(`${language} ${scheme} party, editor and account menu at 150% text`, async ({
  74  |       page,
  75  |     }, info) => {
  76  |       await page.addInitScript(
  77  |         ({ language, scheme }) => {
  78  |           localStorage.setItem('rytta-language', language)
  79  |           localStorage.setItem('rytta-color-scheme', scheme)
  80  |         },
  81  |         { language, scheme },
  82  |       )
  83  |       const errors: string[] = []
  84  |       page.on('pageerror', (e) => errors.push(e.message))
  85  |       await identityFixture(page)
  86  |       await page.emulateMedia({ reducedMotion: 'reduce' })
  87  |       await page.goto(`./#/campaign/${campaignId}/party`)
  88  |       await expect(page.getByRole('heading', { name: 'Arin', exact: true })).toBeVisible()
  89  |       await page.screenshot({
  90  |         path: info.outputPath(`party-${language}-${scheme}-100.png`),
  91  |         fullPage: true,
  92  |       })
  93  |       await page.addStyleTag({ content: 'html { font-size: 150%; }' })
  94  |       for (const screen of ['party', 'editor', 'menu']) {
  95  |         if (screen === 'editor')
  96  |           await page
  97  |             .getByRole('button', { name: language === 'es' ? 'Editar recursos' : 'Edit resources' })
  98  |             .click()
  99  |         if (screen === 'menu') {
  100 |           await page.keyboard.press('Escape')
  101 |           await page
  102 |             .getByRole('button', {
  103 |               name:
  104 |                 language === 'es'
  105 |                   ? 'Abrir menú de cuenta y ajustes'
  106 |                   : 'Open account and settings menu',
  107 |             })
  108 |             .click()
  109 |         }
  110 |         expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
  111 |           true,
  112 |         )
  113 |         expect(
  114 |           (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
  115 |             .violations,
  116 |         ).toEqual([])
  117 |         await page.screenshot({
  118 |           path: info.outputPath(`${screen}-${language}-${scheme}-150.png`),
  119 |           fullPage: true,
  120 |         })
  121 |       }
  122 |       expect(errors).toEqual([])
  123 |     })
  124 |
```
