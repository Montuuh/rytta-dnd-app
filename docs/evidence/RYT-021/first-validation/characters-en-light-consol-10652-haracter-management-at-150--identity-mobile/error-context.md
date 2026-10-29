# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: characters.spec.ts >> en light consolidated character management at 150%
- Location: tests\e2e\characters.spec.ts:7:5

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.click: Test timeout of 30000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: 'Invite Player', exact: true })

```

# Page snapshot

```yaml
- generic [ref=e3]:
  - link "Skip to content" [ref=e4] [cursor=pointer]:
    - /url: "#main-content"
  - generic [ref=e5]:
    - banner [ref=e6]:
      - generic [ref=e7]:
        - button "Open navigation" [ref=e8] [cursor=pointer]
        - paragraph [ref=e12]: The Sunken Coast
      - generic [ref=e13]:
        - button "Player view" [ref=e14] [cursor=pointer]
        - generic [ref=e17]:
          - button "Signed in as dm@example.com" [ref=e18] [cursor=pointer]
          - button "Open settings menu" [ref=e24] [cursor=pointer]
    - main [active] [ref=e27]:
      - generic [ref=e29]:
        - generic [ref=e30]:
          - heading "Members & invitations" [level=1] [ref=e31]
          - paragraph [ref=e32]: Manage campaign access and roles. Invitations grant the Player role; characters are managed in Party.
          - link "Manage characters in Party" [ref=e33] [cursor=pointer]:
            - /url: "#/campaign/20000000-0000-4000-8000-000000000001/party"
        - region [ref=e36]:
          - generic [ref=e37]:
            - generic [ref=e38]:
              - heading "Members" [level=2] [ref=e39]
              - generic [ref=e40]:
                - button "Refresh" [ref=e41] [cursor=pointer]
                - button "Invite player" [ref=e44] [cursor=pointer]
            - generic [ref=e48]:
              - generic [ref=e49]:
                - generic [ref=e50]:
                  - paragraph [ref=e51]: Table DM · You
                  - paragraph [ref=e52]: dm@example.com
                - generic [ref=e53]: DM
              - button "Make Player" [disabled] [ref=e56]
            - generic [ref=e60]:
              - generic [ref=e61]:
                - generic [ref=e62]:
                  - paragraph [ref=e63]: Arin
                  - paragraph [ref=e64]: player@example.com
                - generic [ref=e65]: Player
              - generic [ref=e67]:
                - button "Make DM" [ref=e68] [cursor=pointer]
                - button "Remove member" [ref=e71] [cursor=pointer]
        - region [ref=e74]:
          - generic [ref=e75]:
            - heading "Pending invitations" [level=2] [ref=e76]
            - paragraph [ref=e77]: No pending invitations for this campaign.
        - generic [ref=e79]:
          - paragraph [ref=e80]: A campaign always needs a DM. Make another member a DM before stepping down or leaving.
          - button "Leave membership" [disabled] [ref=e81]
    - contentinfo [ref=e84]: Made for the people around your table.
```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test'
  2   | import AxeBuilder from '@axe-core/playwright'
  3   | import { identityFixture, campaignId, playerId } from './fixtures/identity.ts'
  4   |
  5   | for (const language of ['es', 'en'] as const)
  6   |   for (const scheme of ['dark', 'light'] as const)
  7   |     test(`${language} ${scheme} consolidated character management at 150%`, async ({
  8   |       page,
  9   |     }, info) => {
  10  |       await page.addInitScript(
  11  |         ({ language, scheme }) => {
  12  |           localStorage.setItem('rytta-language', language)
  13  |           localStorage.setItem('rytta-color-scheme', scheme)
  14  |         },
  15  |         { language, scheme },
  16  |       )
  17  |       await identityFixture(page)
  18  |       await page.emulateMedia({ reducedMotion: 'reduce' })
  19  |       await page.goto(`./#/campaign/${campaignId}/party`)
  20  |       await expect(page.getByRole('heading', { name: 'Arin', exact: true })).toBeVisible()
  21  |       await page.addStyleTag({ content: 'html { font-size: 150%; }' })
  22  |       const es = language === 'es'
  23  |       for (const screen of ['party', 'link', 'assigned', 'unlink', 'members', 'invite']) {
  24  |         if (screen === 'link')
  25  |           await page
  26  |             .getByRole('button', { name: es ? 'Vincular jugador' : 'Link Player', exact: true })
  27  |             .click()
  28  |         if (screen === 'assigned') {
  29  |           await page.getByRole('combobox').selectOption(playerId)
  30  |           await page
  31  |             .getByRole('dialog')
  32  |             .getByRole('button', { name: es ? 'Vincular jugador' : 'Link Player', exact: true })
  33  |             .click()
  34  |           await expect(
  35  |             page.getByText(es ? 'Jugador: Arin' : 'Player: Arin', { exact: true }),
  36  |           ).toBeVisible()
  37  |         }
  38  |         if (screen === 'unlink')
  39  |           await page
  40  |             .getByRole('button', {
  41  |               name: es ? 'Desvincular jugador' : 'Unlink Player',
  42  |               exact: true,
  43  |             })
  44  |             .click()
  45  |         if (screen === 'members') {
  46  |           await page.keyboard.press('Escape')
  47  |           await page
  48  |             .getByRole('link', {
  49  |               name: es ? 'Ir a Miembros e invitaciones' : 'Go to Members & invitations',
  50  |               exact: true,
  51  |             })
  52  |             .click()
  53  |           await expect(page.getByRole('heading', { level: 1 })).toHaveText(
  54  |             es ? 'Miembros e invitaciones' : 'Members & invitations',
  55  |           )
  56  |           await expect(page.getByText('player@example.com', { exact: true })).toBeVisible()
  57  |           await expect(
  58  |             page.getByRole('button', { name: /Vincular|Desvincular|Link Player|Unlink Player/ }),
  59  |           ).toHaveCount(0)
  60  |         }
  61  |         if (screen === 'invite')
  62  |           await page
  63  |             .getByRole('button', { name: es ? 'Invitar jugador' : 'Invite Player', exact: true })
> 64  |             .click()
      |              ^ Error: locator.click: Test timeout of 30000ms exceeded.
  65  |         expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
  66  |           true,
  67  |         )
  68  |         expect(
  69  |           (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
  70  |             .violations,
  71  |         ).toEqual([])
  72  |         for (const control of await page
  73  |           .locator(
  74  |             'main button:visible, [role="dialog"] button:visible, [role="dialog"] select:visible',
  75  |           )
  76  |           .all()) {
  77  |           const box = await control.boundingBox()
  78  |           expect(box!.height).toBeGreaterThanOrEqual(44)
  79  |         }
  80  |         await page.screenshot({
  81  |           path: info.outputPath(`${screen}-${language}-${scheme}-150.png`),
  82  |           fullPage: true,
  83  |         })
  84  |       }
  85  |     })
  86  |
  87  | test('assignment explains unavailable Players and recovers from failed member reads', async ({
  88  |   page,
  89  | }, info) => {
  90  |   await identityFixture(page, { twoDms: true })
  91  |   await page.goto(`./#/campaign/${campaignId}/party`)
  92  |   await page.getByRole('button', { name: 'Vincular jugador', exact: true }).click()
  93  |   await expect(
  94  |     page.getByText('Todavía no hay miembros con rol Player.', { exact: false }),
  95  |   ).toBeVisible()
  96  |   await expect(
  97  |     page.getByRole('dialog').getByRole('button', { name: 'Vincular jugador', exact: true }),
  98  |   ).toBeDisabled()
  99  |   await page.screenshot({ path: info.outputPath('no-players.png'), fullPage: true })
  100 |   await page.keyboard.press('Escape')
  101 |   let fail = true
  102 |   await page.route('**/rest/v1/rpc/list_campaign_members', async (route) => {
  103 |     if (fail)
  104 |       await route.fulfill({
  105 |         status: 503,
  106 |         contentType: 'application/json',
  107 |         body: JSON.stringify({ message: 'Unavailable' }),
  108 |       })
  109 |     else await route.fallback()
  110 |   })
  111 |   await page.reload()
  112 |   await page.getByRole('button', { name: 'Vincular jugador', exact: true }).click()
  113 |   await expect(page.getByRole('dialog').getByRole('alert')).toContainText('No se pudo cargar')
  114 |   await page.screenshot({ path: info.outputPath('assignment-error.png'), fullPage: true })
  115 |   fail = false
  116 |   await page.getByRole('button', { name: 'Reintentar', exact: true }).click()
  117 |   await expect(
  118 |     page.getByText('Todavía no hay miembros con rol Player.', { exact: false }),
  119 |   ).toBeVisible()
  120 |   await page.getByRole('dialog').getByRole('link', { name: 'Ir a Miembros e invitaciones' }).click()
  121 |   await expect(page.getByRole('heading', { level: 1 })).toHaveText('Miembros e invitaciones')
  122 | })
  123 |
  124 | test('a Player already linked to another character is not offered again', async ({
  125 |   page,
  126 | }, info) => {
  127 |   await identityFixture(page)
  128 |   await page.goto(`./#/campaign/${campaignId}/party`)
  129 |   await page.getByRole('button', { name: 'Vincular jugador', exact: true }).click()
  130 |   await page.getByRole('combobox').selectOption(playerId)
  131 |   await page
  132 |     .getByRole('dialog')
  133 |     .getByRole('button', { name: 'Vincular jugador', exact: true })
  134 |     .click()
  135 |   await expect(page.getByRole('dialog')).toHaveCount(0)
  136 |   await page.getByRole('button', { name: 'Crear personaje', exact: true }).click()
  137 |   await page.getByLabel('Nombre del personaje').fill('Second hero')
  138 |   await page
  139 |     .getByRole('dialog')
  140 |     .getByRole('button', { name: 'Crear personaje', exact: true })
  141 |     .click()
  142 |   await page.getByRole('button', { name: 'Vincular jugador', exact: true }).click()
  143 |   await expect(
  144 |     page.getByText('Todos los jugadores ya tienen personaje.', { exact: false }),
  145 |   ).toBeVisible()
  146 |   await expect(page.getByRole('combobox')).toHaveCount(0)
  147 |   await expect(
  148 |     page.getByRole('dialog').getByRole('button', { name: 'Vincular jugador', exact: true }),
  149 |   ).toBeDisabled()
  150 |   await page.screenshot({ path: info.outputPath('all-players-linked.png'), fullPage: true })
  151 | })
  152 |
  153 | test('DM creates before assignment, edits whole homebrew units and recovers from a stale editor', async ({
  154 |   page,
  155 | }) => {
  156 |   const f = await identityFixture(page)
  157 |   await page.goto(`./#/campaign/${campaignId}/party`)
  158 |   const create = page.getByRole('button', { name: 'Crear personaje', exact: true })
  159 |   await create.click()
  160 |   await expect(page.getByLabel('Nombre del personaje')).toBeFocused()
  161 |   await page.keyboard.press('Escape')
  162 |   await expect(create).toBeFocused()
  163 |   await create.click()
  164 |   await page.getByLabel('Nombre del personaje').fill('New hero')
```