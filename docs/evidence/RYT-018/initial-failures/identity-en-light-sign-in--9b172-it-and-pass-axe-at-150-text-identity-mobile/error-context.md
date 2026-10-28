# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: identity.spec.ts >> en light sign-in, hub and member screens fit and pass axe at 150% text
- Location: tests\e2e\identity.spec.ts:233:5

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText('Arin', { exact: true })
Expected: visible
Error: strict mode violation: getByText('Arin', { exact: true }) resolved to 2 elements:
    1) <p class="mantine-focus-auto user-copy m_b6d8b162 mantine-Text-root">Arin</p> aka getByText('Arin').nth(1)
    2) <p class="mantine-focus-auto user-copy m_b6d8b162 mantine-Text-root">Arin</p> aka getByText('Arin').nth(2)

Call log:
  - Expect "toBeVisible" getByText('Arin', { exact: true }) with timeout 5000ms
  - waiting for getByText('Arin', { exact: true })

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
        - button "Signed in as dm@example.com" [ref=e17] [cursor=pointer]
        - button "Open settings menu" [ref=e23] [cursor=pointer]
    - main [active] [ref=e26]:
      - generic [ref=e28]:
        - generic [ref=e29]:
          - heading "Your table" [level=1] [ref=e30]
          - paragraph [ref=e31]: DMs share campaign management. Invitations always start as Player.
        - generic [ref=e32]:
          - heading "Link character" [level=2] [ref=e33]
          - paragraph [ref=e34]: "Table DM: No character"
          - paragraph [ref=e35]: "Arin: No character"
          - generic [ref=e37]:
            - generic [ref=e38]:
              - paragraph [ref=e39]: Arin
              - paragraph [ref=e40]: Unassigned
            - button "Link character" [ref=e41] [cursor=pointer]
        - region [ref=e44]:
          - generic [ref=e45]:
            - generic [ref=e46]:
              - heading "Members" [level=2] [ref=e47]
              - button "Refresh" [ref=e48] [cursor=pointer]
            - generic [ref=e54]:
              - generic [ref=e55]:
                - generic [ref=e56]:
                  - paragraph [ref=e57]: Table DM · You
                  - paragraph [ref=e58]: dm@example.com
                - generic [ref=e59]: DM
              - button "Make Player" [disabled] [ref=e62]
            - generic [ref=e66]:
              - generic [ref=e67]:
                - generic [ref=e68]:
                  - paragraph [ref=e69]: Arin
                  - paragraph [ref=e70]: player@example.com
                - generic [ref=e71]: Player
              - generic [ref=e73]:
                - button "Make DM" [ref=e74] [cursor=pointer]
                - button "Remove member" [ref=e77] [cursor=pointer]
        - region [ref=e80]:
          - generic [ref=e81]:
            - heading "Pending invitations" [level=2] [ref=e82]
            - paragraph [ref=e83]: No pending invitations for this campaign.
        - generic [ref=e85]:
          - paragraph [ref=e86]: A campaign always needs a DM. Make another member a DM before stepping down or leaving.
          - button "Leave membership" [disabled] [ref=e87]
    - contentinfo [ref=e90]: Made for the people around your table.
```

# Test source

```ts
  153 |   await expect(page.getByRole('button', { name: 'Invitar jugador' })).toHaveCount(0)
  154 |   expect(
  155 |     f.calls.filter((c) => ['list_campaign_members', 'campaign_invitations'].includes(c.method)),
  156 |   ).toEqual([])
  157 |   f.revokeAccess()
  158 |   await page.reload()
  159 |   await expect(page.getByText('Esta campaña no está disponible para tu cuenta.')).toBeVisible()
  160 | })
  161 |
  162 | test('account change and session expiry remove the previous private screen', async ({ page }) => {
  163 |   await identityFixture(page)
  164 |   await page.goto(`./#/campaign/${campaignId}/members`)
  165 |   await expect(page.getByText('dm@example.com', { exact: true })).toBeVisible()
  166 |   const next = session(playerId)
  167 |   await page.evaluate(
  168 |     ({ key, value }) => {
  169 |       localStorage.setItem(key, JSON.stringify(value))
  170 |       const channel = new BroadcastChannel(key)
  171 |       channel.postMessage({ event: 'SIGNED_IN', session: value })
  172 |       channel.close()
  173 |     },
  174 |     { key: storageKey, value: next },
  175 |   )
  176 |   await expect(page.getByRole('button', { name: 'Sesión de player@example.com' })).toBeVisible()
  177 |   await page.keyboard.press('Escape')
  178 |   await expect(page.getByText('Tu DM gestiona los miembros y las invitaciones.')).toBeVisible()
  179 |   await expect(page.getByText('dm@example.com', { exact: true })).toHaveCount(0)
  180 |   // SDK event is real, backend identity switching is covered in SQL; end session across tabs.
  181 |   await page.evaluate((key) => {
  182 |     localStorage.removeItem(key)
  183 |     const channel = new BroadcastChannel(key)
  184 |     channel.postMessage({ event: 'SIGNED_OUT', session: null })
  185 |     channel.close()
  186 |   }, storageKey)
  187 |   await expect(page.getByText('Tu sesión ha terminado.')).toBeVisible()
  188 |   await expect(page.getByText('dm@example.com', { exact: true })).toHaveCount(0)
  189 | })
  190 |
  191 | test('self-demotion clears management views and offline actions are not queued', async ({
  192 |   page,
  193 |   context,
  194 | }) => {
  195 |   const f = await identityFixture(page, { twoDms: true })
  196 |   await page.goto(`./#/campaign/${campaignId}/members`)
  197 |   await expect(page.getByRole('heading', { name: 'Tu mesa', exact: true })).toBeVisible()
  198 |   await page.getByRole('button', { name: 'Vincular personaje', exact: true }).click()
  199 |   await context.setOffline(true)
  200 |   await page.getByLabel('Correo de la cuenta de Google').fill('offline@example.com')
  201 |   await page
  202 |     .getByRole('dialog')
  203 |     .getByRole('button', { name: 'Invitar jugador', exact: true })
  204 |     .click()
  205 |   await expect(page.getByRole('dialog').getByRole('alert')).toContainText(
  206 |     'No se pudo completar la acción',
  207 |   )
  208 |   await context.setOffline(false)
  209 |   expect(f.calls.filter((c) => c.method === 'invite_character_player')).toHaveLength(0)
  210 |   await page.goto(`./#/campaign/${campaignId}/members`)
  211 |   const self = page
  212 |     .locator('.mantine-Paper-root')
  213 |     .filter({ has: page.getByText('Table DM · Tú', { exact: true }) })
  214 |   await self.getByRole('button', { name: 'Cambiar a Player', exact: true }).click()
  215 |   await page.getByRole('dialog').getByRole('button', { name: 'Confirmar', exact: true }).click()
  216 |   await expect(page.getByText('Tu DM gestiona los miembros y las invitaciones.')).toBeVisible()
  217 |   await expect(page.getByRole('button', { name: 'Invitar jugador' })).toHaveCount(0)
  218 | })
  219 |
  220 | test('failed refresh hides cached campaign content and offers recovery', async ({ page }) => {
  221 |   const f = await identityFixture(page)
  222 |   await page.goto('./')
  223 |   await expect(page.getByRole('heading', { name: 'The Sunken Coast' })).toBeVisible()
  224 |   f.failCampaigns()
  225 |   await page.getByRole('button', { name: 'Actualizar', exact: true }).click()
  226 |   await expect(page.getByRole('alert').first()).toContainText('No se pudo cargar')
  227 |   await expect(page.getByRole('heading', { name: 'The Sunken Coast' })).toHaveCount(0)
  228 |   await expect(page.getByRole('button', { name: 'Reintentar' })).toBeEnabled()
  229 | })
  230 |
  231 | for (const language of ['es', 'en'] as const)
  232 |   for (const scheme of ['dark', 'light'] as const) {
  233 |     test(`${language} ${scheme} sign-in, hub and member screens fit and pass axe at 150% text`, async ({
  234 |       page,
  235 |     }, testInfo) => {
  236 |       await page.addInitScript(
  237 |         ({ language, scheme }) => {
  238 |           localStorage.setItem('rytta-language', language)
  239 |           localStorage.setItem('rytta-color-scheme', scheme)
  240 |         },
  241 |         { language, scheme },
  242 |       )
  243 |       await identityFixture(page)
  244 |       await page.emulateMedia({ reducedMotion: 'reduce' })
  245 |       for (const [screen, route] of [
  246 |         ['hub', './'],
  247 |         ['members', `./#/campaign/${campaignId}/members`],
  248 |       ] as const) {
  249 |         await page.goto(route)
  250 |         await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  251 |         await expect(
  252 |           page.getByText(screen === 'hub' ? 'The Sunken Coast' : 'Arin', { exact: true }),
> 253 |         ).toBeVisible()
      |           ^ Error: expect(locator).toBeVisible() failed
  254 |         await page.screenshot({
  255 |           path: testInfo.outputPath(`${screen}-${language}-${scheme}-100.png`),
  256 |           fullPage: true,
  257 |           scale: 'css',
  258 |         })
  259 |         await page.addStyleTag({ content: 'html { font-size: 150%; }' })
  260 |         expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
  261 |           true,
  262 |         )
  263 |         const audit = await new AxeBuilder({ page })
  264 |           .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
  265 |           .analyze()
  266 |         expect(
  267 |           audit.violations.map((v) => ({
  268 |             id: v.id,
  269 |             nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })),
  270 |           })),
  271 |         ).toEqual([])
  272 |         await page.screenshot({
  273 |           path: testInfo.outputPath(`${screen}-${language}-${scheme}-150.png`),
  274 |           fullPage: true,
  275 |           scale: 'css',
  276 |         })
  277 |       }
  278 |       await page.goto('./')
  279 |       await page
  280 |         .getByRole('button', {
  281 |           name: language === 'es' ? 'Cerrar sesión' : 'Sign out',
  282 |           exact: true,
  283 |         })
  284 |         .click()
  285 |       await expect(
  286 |         page.getByRole('button', {
  287 |           name: language === 'es' ? 'Continuar con Google' : 'Continue with Google',
  288 |         }),
  289 |       ).toBeVisible()
  290 |       const audit = await new AxeBuilder({ page })
  291 |         .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
  292 |         .analyze()
  293 |       expect(audit.violations).toEqual([])
  294 |       await page.screenshot({
  295 |         path: testInfo.outputPath(`sign-in-${language}-${scheme}-150.png`),
  296 |         fullPage: true,
  297 |         scale: 'css',
  298 |       })
  299 |     })
  300 |   }
  301 |
```
