# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: characters.spec.ts >> DM creates before assignment, invites, edits whole homebrew units and recovers from a stale editor
- Location: tests\e2e\characters.spec.ts:5:1

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.fill: Test timeout of 30000ms exceeded.
Call log:
  - waiting for getByLabel('Oro', { exact: true })

```

# Page snapshot

```yaml
- generic [ref=e1]:
  - generic [ref=e3]:
    - link "Saltar al contenido" [ref=e4] [cursor=pointer]:
      - /url: "#main-content"
    - complementary [ref=e5]:
      - generic [ref=e10]:
        - text: RYTTA
        - generic [ref=e11]: TU COMPAÑERO DE MESA
      - paragraph [ref=e12]: TU AVENTURA
      - navigation "Navegación principal" [ref=e13]:
        - generic [ref=e14]:
          - link "Mis campañas" [ref=e15] [cursor=pointer]:
            - /url: "#/"
          - link "Campamento" [ref=e16] [cursor=pointer]:
            - /url: "#/campaign/20000000-0000-4000-8000-000000000001"
          - link "Grupo" [ref=e20] [cursor=pointer]:
            - /url: "#/campaign/20000000-0000-4000-8000-000000000001/party"
          - link "Inventario" [ref=e26] [cursor=pointer]:
            - /url: "#/campaign/20000000-0000-4000-8000-000000000001/inventory"
          - link "Tiendas" [ref=e31] [cursor=pointer]:
            - /url: "#/campaign/20000000-0000-4000-8000-000000000001/shops"
          - link "Misiones" [ref=e36] [cursor=pointer]:
            - /url: "#/campaign/20000000-0000-4000-8000-000000000001/quests"
          - link "Combate" [ref=e40] [cursor=pointer]:
            - /url: "#/campaign/20000000-0000-4000-8000-000000000001/combat"
          - link "Atlas" [ref=e50] [cursor=pointer]:
            - /url: "#/campaign/20000000-0000-4000-8000-000000000001/atlas"
          - link "Glosario" [ref=e53] [cursor=pointer]:
            - /url: "#/campaign/20000000-0000-4000-8000-000000000001/glossary"
          - link "Recuerdos" [ref=e56] [cursor=pointer]:
            - /url: "#/campaign/20000000-0000-4000-8000-000000000001/memories"
          - link "Bastión" [ref=e61] [cursor=pointer]:
            - /url: "#/campaign/20000000-0000-4000-8000-000000000001/stronghold"
          - link "Taller" [ref=e64] [cursor=pointer]:
            - /url: "#/campaign/20000000-0000-4000-8000-000000000001/workshop"
          - link "Miembros e invitaciones" [ref=e68] [cursor=pointer]:
            - /url: "#/campaign/20000000-0000-4000-8000-000000000001/members"
        - link "Ajustes" [ref=e69] [cursor=pointer]:
          - /url: "#/settings"
      - generic [ref=e73]: Menos cuentas.Más aventuras.
    - generic [ref=e74]:
      - banner [ref=e75]:
        - generic [ref=e76]:
          - button "Abrir menú de cuenta y ajustes" [ref=e77] [cursor=pointer]
          - paragraph [ref=e80]: Tu compañero de aventuras
        - generic [ref=e81]: Tu mesa
      - main [ref=e84]:
        - generic [ref=e85]:
          - generic [ref=e87]:
            - generic [ref=e88]:
              - paragraph [ref=e89]: CAMPAÑA ACTUAL
              - generic [ref=e90]:
                - paragraph [ref=e91]: The Sunken Coast
                - generic [ref=e92]: DM
            - link "Volver a mi cuenta" [ref=e94] [cursor=pointer]:
              - /url: "#/"
          - generic [ref=e97]:
            - generic [ref=e98]:
              - generic [ref=e99]:
                - heading "Personajes y recursos" [level=1] [ref=e100]
                - paragraph [ref=e101]: Crea un personaje e invita a su jugador. El DM gestiona los recursos.
              - button "Crear personaje" [ref=e102] [cursor=pointer]
            - paragraph [ref=e105]: Homebrew · Oro entero, raciones de comida y agua · Agotamiento manual
            - generic [ref=e106]:
              - paragraph [ref=e107]: "Última consulta: 10:22:10"
              - button "Actualizar" [ref=e108] [cursor=pointer]
            - status [ref=e111]:
              - generic [ref=e112]: Invitación creada. Puedes gestionarla en Miembros e invitaciones.
            - generic [ref=e115]:
              - generic [ref=e117]:
                - generic [ref=e118]:
                  - heading "Arin" [level=2] [ref=e119]
                  - generic [ref=e120]: Sin jugador
                - generic [ref=e122]:
                  - generic [ref=e123]:
                    - paragraph [ref=e124]: Oro
                    - paragraph [ref=e125]: "25"
                  - generic [ref=e126]:
                    - paragraph [ref=e127]: Raciones de agua
                    - paragraph [ref=e128]: "3"
                  - generic [ref=e129]:
                    - paragraph [ref=e130]: Raciones de comida
                    - paragraph [ref=e131]: "4"
                  - generic [ref=e132]:
                    - paragraph [ref=e133]: Agotamiento
                    - paragraph [ref=e134]: "0"
                - generic [ref=e135]:
                  - button "Editar recursos" [ref=e136] [cursor=pointer]
                  - button "Invitar jugador" [ref=e139] [cursor=pointer]
              - generic [ref=e143]:
                - generic [ref=e144]:
                  - heading "New hero" [level=2] [ref=e145]
                  - generic [ref=e146]: Sin jugador
                - generic [ref=e148]:
                  - generic [ref=e149]:
                    - paragraph [ref=e150]: Oro
                    - paragraph [ref=e151]: "0"
                  - generic [ref=e152]:
                    - paragraph [ref=e153]: Raciones de agua
                    - paragraph [ref=e154]: "0"
                  - generic [ref=e155]:
                    - paragraph [ref=e156]: Raciones de comida
                    - paragraph [ref=e157]: "0"
                  - generic [ref=e158]:
                    - paragraph [ref=e159]: Agotamiento
                    - paragraph [ref=e160]: "0"
                - generic [ref=e161]:
                  - button "Editar recursos" [ref=e162] [cursor=pointer]
                  - button "Invitar jugador" [ref=e165] [cursor=pointer]
      - contentinfo [ref=e168]: Para quienes comparten tu mesa.
  - dialog [ref=e170]:
    - banner [ref=e171]:
      - heading "Editar recursos" [level=2] [ref=e172]
      - button "Cancelar" [ref=e173] [cursor=pointer]
    - generic [ref=e178]:
      - paragraph [ref=e179]: Arin
      - generic [ref=e180]:
        - generic [ref=e181]: Oro *
        - textbox "Oro" [active] [ref=e183]: "25"
      - generic [ref=e184]:
        - generic [ref=e185]: Raciones de agua *
        - textbox "Raciones de agua" [ref=e187]: "3"
      - generic [ref=e188]:
        - generic [ref=e189]: Raciones de comida *
        - textbox "Raciones de comida" [ref=e191]: "4"
      - generic [ref=e192]:
        - generic [ref=e193]: Agotamiento *
        - textbox "Agotamiento" [ref=e195]: "0"
      - generic [ref=e196]:
        - button "Cancelar" [ref=e197] [cursor=pointer]
        - button "Guardar recursos" [ref=e200] [cursor=pointer]
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
> 36  |   await page.getByLabel('Oro', { exact: true }).fill('99')
      |                                                 ^ Error: locator.fill: Test timeout of 30000ms exceeded.
  37  |   await page.getByLabel('Agotamiento', { exact: true }).fill('12')
  38  |   await page.getByRole('button', { name: 'Guardar recursos' }).click()
  39  |   await expect(arin.getByText('99', { exact: true })).toBeVisible()
  40  |   await arin.getByRole('button', { name: 'Editar recursos' }).click()
  41  |   f.staleResources()
  42  |   await page.getByLabel('Oro', { exact: true }).fill('100')
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
  62  |   await expect(menu).toBeFocused()
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
