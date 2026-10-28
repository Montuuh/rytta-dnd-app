# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: characters.spec.ts >> en light party, editor and account menu at 150% text
- Location: tests\e2e\characters.spec.ts:69:5

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false
```

# Page snapshot

```yaml
- generic [ref=e3]:
  - link "Skip to content" [ref=e4] [cursor=pointer]:
    - /url: "#main-content"
  - complementary [ref=e5]:
    - generic [ref=e10]:
      - text: RYTTA
      - generic [ref=e11]: THE TABLE COMPANION
    - paragraph [ref=e12]: YOUR ADVENTURE
    - navigation "Main navigation" [ref=e13]:
      - generic [ref=e14]:
        - link "Camp" [ref=e15] [cursor=pointer]:
          - /url: "#/campaign/20000000-0000-4000-8000-000000000001"
        - link "Party" [ref=e19] [cursor=pointer]:
          - /url: "#/campaign/20000000-0000-4000-8000-000000000001/party"
        - paragraph [ref=e25]:
          - text: Inventory
          - generic [ref=e30]: Planned module
        - paragraph [ref=e31]:
          - text: Shops
          - generic [ref=e36]: Planned module
        - paragraph [ref=e37]:
          - text: Quests
          - generic [ref=e41]: Planned module
        - paragraph [ref=e42]:
          - text: Combat
          - generic [ref=e52]: Planned module
        - paragraph [ref=e53]:
          - text: Atlas
          - generic [ref=e56]: Planned module
        - paragraph [ref=e57]:
          - text: Glossary
          - generic [ref=e60]: Planned module
        - paragraph [ref=e61]:
          - text: Memories
          - generic [ref=e66]: Planned module
        - paragraph [ref=e67]:
          - text: Stronghold
          - generic [ref=e70]: Planned module
        - paragraph [ref=e71]:
          - text: Workshop
          - generic [ref=e75]: Planned module
        - link "Members and invitations" [ref=e76] [cursor=pointer]:
          - /url: "#/campaign/20000000-0000-4000-8000-000000000001/members"
    - generic [ref=e77]: Less bookkeeping.More adventure.
  - generic [ref=e78]:
    - banner [ref=e79]:
      - generic:
        - paragraph: The Sunken Coast
      - generic [ref=e80]:
        - button "Player view" [ref=e81] [cursor=pointer]
        - button "Signed in as dm@example.com" [ref=e84] [cursor=pointer]:
          - generic [ref=e85]: dm@example.com
        - button "Open settings menu" [ref=e92] [cursor=pointer]
    - main [ref=e95]:
      - generic [ref=e97]:
        - generic [ref=e98]:
          - heading "Characters & resources" [level=1] [ref=e100]
          - button "Create character" [ref=e101] [cursor=pointer]
        - generic [ref=e104]:
          - paragraph [ref=e105]: "Last checked: 9:56:38 PM"
          - button "Refresh" [ref=e106] [cursor=pointer]
        - generic [ref=e111]:
          - generic [ref=e112]:
            - heading "Arin" [level=2] [ref=e113]
            - generic [ref=e114]: Unassigned
          - generic [ref=e116]:
            - generic [ref=e117]:
              - paragraph [ref=e118]: Gold
              - paragraph [ref=e119]: "25"
            - generic [ref=e120]:
              - paragraph [ref=e121]: Water rations
              - paragraph [ref=e122]: "3"
            - generic [ref=e123]:
              - paragraph [ref=e124]: Food rations
              - paragraph [ref=e125]: "4"
            - generic [ref=e126]:
              - paragraph [ref=e127]: Exhaustion
              - paragraph [ref=e128]: "0"
          - button "Edit resources" [ref=e130] [cursor=pointer]
    - contentinfo [ref=e133]: Made for the people around your table.
```

# Test source

```ts
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
  25  |   await expect(card.getByRole('button', { name: 'Invitar jugador' })).toHaveCount(0)
  26  |   const arin = page
  27  |     .locator('.character-card')
  28  |     .filter({ has: page.getByRole('heading', { name: 'Arin', exact: true }) })
  29  |   await arin.getByRole('button', { name: 'Editar recursos' }).click()
  30  |   await page.getByRole('textbox', { name: 'Oro', exact: true }).fill('99')
  31  |   await page.getByRole('textbox', { name: 'Agotamiento', exact: true }).fill('12')
  32  |   await page.getByRole('button', { name: 'Guardar recursos' }).click()
  33  |   await expect(arin.getByText('99', { exact: true })).toBeVisible()
  34  |   await arin.getByRole('button', { name: 'Editar recursos' }).click()
  35  |   f.staleResources()
  36  |   await page.getByRole('textbox', { name: 'Oro', exact: true }).fill('100')
  37  |   await page.getByRole('button', { name: 'Guardar recursos' }).click()
  38  |   await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Otro DM')
  39  |   await expect(page.getByRole('button', { name: 'Guardar recursos' })).toBeDisabled()
  40  |   await page.keyboard.press('Escape')
  41  |   await page.getByRole('button', { name: 'Actualizar', exact: true }).click()
  42  |   await expect(arin.getByText('70', { exact: true })).toBeVisible()
  43  | })
  44  |
  45  | test('Player sees own resources read-only; account menu returns home without leaving membership', async ({
  46  |   page,
  47  | }) => {
  48  |   const f = await identityFixture(page, { player: true })
  49  |   await page.goto(`./#/campaign/${campaignId}/party`)
  50  |   await expect(page.getByText('Tu personaje', { exact: true })).toBeVisible()
  51  |   await expect(page.getByRole('button', { name: 'Editar recursos' })).toHaveCount(0)
  52  |   await expect(page.getByRole('button', { name: 'Crear personaje' })).toHaveCount(0)
  53  |   const menu = page.getByRole('button', { name: 'Abrir menú de ajustes' })
  54  |   await menu.click()
  55  |   await page.keyboard.press('Escape')
  56  |   await expect(menu).toBeFocused()
  57  |   await menu.press('Enter')
  58  |   await page.keyboard.press('Escape')
  59  |   await page.getByRole('button', { name: 'Sesión de player@example.com' }).click()
  60  |   await page.getByRole('menuitem', { name: 'Mis campañas', exact: true }).click()
  61  |   await expect(page.getByRole('heading', { name: 'Mis campañas', exact: true })).toBeVisible()
  62  |   expect(f.calls.filter((c) => c.method === 'change_campaign_member')).toHaveLength(0)
  63  |   await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click()
  64  |   await expect(page.getByRole('button', { name: 'Continuar con Google' })).toBeVisible()
  65  | })
  66  |
  67  | for (const language of ['es', 'en'] as const)
  68  |   for (const scheme of ['dark', 'light'] as const)
  69  |     test(`${language} ${scheme} party, editor and account menu at 150% text`, async ({
  70  |       page,
  71  |     }, info) => {
  72  |       await page.addInitScript(
  73  |         ({ language, scheme }) => {
  74  |           localStorage.setItem('rytta-language', language)
  75  |           localStorage.setItem('rytta-color-scheme', scheme)
  76  |         },
  77  |         { language, scheme },
  78  |       )
  79  |       const errors: string[] = []
  80  |       page.on('pageerror', (e) => errors.push(e.message))
  81  |       await identityFixture(page)
  82  |       await page.emulateMedia({ reducedMotion: 'reduce' })
  83  |       await page.goto(`./#/campaign/${campaignId}/party`)
  84  |       await expect(page.getByRole('heading', { name: 'Arin', exact: true })).toBeVisible()
  85  |       await page.screenshot({
  86  |         path: info.outputPath(`party-${language}-${scheme}-100.png`),
  87  |         fullPage: true,
  88  |       })
  89  |       await page.addStyleTag({ content: 'html { font-size: 150%; }' })
  90  |       for (const screen of ['party', 'editor', 'menu']) {
  91  |         if (screen === 'editor')
  92  |           await page
  93  |             .getByRole('button', { name: language === 'es' ? 'Editar recursos' : 'Edit resources' })
  94  |             .click()
  95  |         if (screen === 'menu') {
  96  |           await page.keyboard.press('Escape')
  97  |           await page
  98  |             .getByRole('button', {
  99  |               name: language === 'es' ? 'Abrir menú de ajustes' : 'Open settings menu',
  100 |             })
  101 |             .click()
  102 |         }
> 103 |         expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      |                                                                                               ^ Error: expect(received).toBe(expected) // Object.is equality
  104 |           true,
  105 |         )
  106 |         expect(
  107 |           (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
  108 |             .violations,
  109 |         ).toEqual([])
  110 |         await page.screenshot({
  111 |           path: info.outputPath(`${screen}-${language}-${scheme}-150.png`),
  112 |           fullPage: true,
  113 |         })
  114 |       }
  115 |       expect(errors).toEqual([])
  116 |     })
  117 |
  118 | test('maximum valid resources remain readable within cards at 150% text', async ({
  119 |   page,
  120 | }, info) => {
  121 |   const fixture = await identityFixture(page)
  122 |   fixture.maxResources()
  123 |   await page.goto(`./#/campaign/${campaignId}/party`)
  124 |   await expect(page.getByRole('heading', { name: 'Arin', exact: true })).toBeVisible()
  125 |   await page.addStyleTag({ content: 'html { font-size: 150%; }' })
  126 |   expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  127 |   for (const cell of await page.locator('.resource-cell').all()) {
  128 |     expect(await cell.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
  129 |   }
  130 |   await expect(page.locator('.resource-value').first()).toHaveText(
  131 |     Number.MAX_SAFE_INTEGER.toLocaleString('es'),
  132 |   )
  133 |   await page.screenshot({ path: info.outputPath('max-resources-150.png'), fullPage: true })
  134 | })
  135 |
```
