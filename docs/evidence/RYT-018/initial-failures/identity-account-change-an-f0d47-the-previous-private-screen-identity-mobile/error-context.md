# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: identity.spec.ts >> account change and session expiry remove the previous private screen
- Location: tests\e2e\identity.spec.ts:162:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText('dm@example.com', { exact: true })
Expected: visible
Error: strict mode violation: getByText('dm@example.com', { exact: true }) resolved to 2 elements:
    1) <span class="account-email">dm@example.com</span> aka getByRole('button', { name: 'Sesión de dm@example.com' })
    2) <p data-size="sm" class="mantine-focus-auto user-copy m_b6d8b162 mantine-Text-root">dm@example.com</p> aka locator('#main-content').getByText('dm@example.com')

Call log:
  - Expect "toBeVisible" getByText('dm@example.com', { exact: true }) with timeout 5000ms
  - waiting for getByText('dm@example.com', { exact: true })
    - locator resolved to <span class="account-email">dm@example.com</span>
    - unexpected value "hidden"

```

# Page snapshot

```yaml
- generic [ref=e3]:
  - link "Saltar al contenido" [ref=e4] [cursor=pointer]:
    - /url: "#main-content"
  - generic [ref=e5]:
    - banner [ref=e6]:
      - generic [ref=e7]:
        - button "Abrir navegación" [ref=e8] [cursor=pointer]
        - paragraph [ref=e12]: The Sunken Coast
      - generic [ref=e13]:
        - button "Vista Player" [ref=e14] [cursor=pointer]
        - button "Sesión de dm@example.com" [ref=e17] [cursor=pointer]
        - button "Abrir menú de ajustes" [ref=e23] [cursor=pointer]
    - main [ref=e26]:
      - generic [ref=e28]:
        - generic [ref=e29]:
          - heading "Tu mesa" [level=1] [ref=e30]
          - paragraph [ref=e31]: Los DMs comparten la gestión de la campaña. Las invitaciones siempre dan el rol Player.
        - generic [ref=e32]:
          - heading "Vincular personaje" [level=2] [ref=e33]
          - paragraph [ref=e34]: "Table DM: Sin personaje"
          - paragraph [ref=e35]: "Arin: Sin personaje"
          - generic [ref=e37]:
            - generic [ref=e38]:
              - paragraph [ref=e39]: Arin
              - paragraph [ref=e40]: Sin jugador
            - button "Vincular personaje" [ref=e41] [cursor=pointer]
        - region [ref=e44]:
          - generic [ref=e45]:
            - generic [ref=e46]:
              - heading "Miembros" [level=2] [ref=e47]
              - button "Actualizar" [ref=e48] [cursor=pointer]
            - generic [ref=e52]:
              - generic [ref=e53]:
                - generic [ref=e54]:
                  - paragraph [ref=e55]: Table DM · Tú
                  - paragraph [ref=e56]: dm@example.com
                - generic [ref=e57]: DM
              - button "Cambiar a Player" [disabled] [ref=e60]
            - generic [ref=e64]:
              - generic [ref=e65]:
                - generic [ref=e66]:
                  - paragraph [ref=e67]: Arin
                  - paragraph [ref=e68]: player@example.com
                - generic [ref=e69]: Player
              - generic [ref=e71]:
                - button "Nombrar DM" [ref=e72] [cursor=pointer]
                - button "Retirar miembro" [ref=e75] [cursor=pointer]
        - region [ref=e78]:
          - generic [ref=e79]:
            - heading "Invitaciones pendientes" [level=2] [ref=e80]
            - paragraph [ref=e81]: No hay invitaciones pendientes para esta campaña.
        - generic [ref=e83]:
          - paragraph [ref=e84]: La campaña siempre necesita un DM. Nombra a otro miembro DM antes de dejar el rol o salir.
          - button "Abandonar campaña" [disabled] [ref=e85]
    - contentinfo [ref=e88]: Para quienes comparten tu mesa.
```

# Test source

```ts
  65  |
  66  | test('empty hub creates a DM campaign, accepts a Player invitation and signs out', async ({
  67  |   page,
  68  | }) => {
  69  |   const errors: string[] = []
  70  |   page.on('pageerror', (error) => errors.push(error.message))
  71  |   await identityFixture(page, { empty: true })
  72  |   await page.goto('./')
  73  |   await expect(page.getByText('Tu mesa te espera.')).toBeVisible()
  74  |   const create = page.locator('main').getByRole('button', { name: 'Crear campaña', exact: true })
  75  |   await create.click()
  76  |   await expect(page.getByLabel('Nombre de la campaña')).toBeFocused()
  77  |   await page.keyboard.press('Escape')
  78  |   await expect(page.getByRole('dialog')).not.toBeVisible()
  79  |   await expect(create).toBeFocused()
  80  |   await create.click()
  81  |   await page.getByLabel('Nombre de la campaña').fill('Our new table')
  82  |   await page.getByRole('dialog').getByRole('button', { name: 'Crear campaña', exact: true }).click()
  83  |   await expect(page.getByRole('heading', { name: 'Our new table' })).toBeVisible()
  84  |   await page.getByRole('button', { name: 'Aceptar invitación' }).click()
  85  |   await expect(page.getByRole('heading', { name: 'The Amber Road' })).toBeVisible()
  86  |   await page.getByRole('link', { name: 'Abrir campaña: Our new table' }).click()
  87  |   await expect(page.getByRole('heading', { name: 'Our new table', exact: true })).toBeVisible()
  88  |   await page.reload()
  89  |   await expect(page.getByRole('heading', { name: 'Our new table', exact: true })).toBeVisible()
  90  |   await page.getByRole('button', { name: /Sesión de/ }).click()
  91  |   await page.getByRole('menuitem', { name: 'Mis campañas', exact: true }).click()
  92  |   await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click()
  93  |   await expect(page.getByRole('button', { name: 'Continuar con Google' })).toBeVisible()
  94  |   await expect(page.getByRole('heading', { name: 'Our new table' })).toHaveCount(0)
  95  |   expect(errors).toEqual([])
  96  | })
  97  |
  98  | test('DM invites, cancels and hands over before leaving; campaign routes stay scoped', async ({
  99  |   page,
  100 | }) => {
  101 |   const f = await identityFixture(page)
  102 |   await page.goto(`./#/campaign/${campaignId}/members`)
  103 |   await expect(page.getByRole('heading', { name: 'Tu mesa', exact: true })).toBeVisible()
  104 |   await expect(page.getByRole('button', { name: 'Abandonar campaña', exact: true })).toBeDisabled()
  105 |   await page.getByRole('button', { name: 'Vincular personaje', exact: true }).click()
  106 |   await page.getByLabel('Correo de la cuenta de Google').fill('new@example.com')
  107 |   await page
  108 |     .getByRole('dialog')
  109 |     .getByRole('button', { name: 'Invitar jugador', exact: true })
  110 |     .click()
  111 |   await expect(page.getByRole('dialog')).not.toBeVisible()
  112 |   await page.goto(`./#/campaign/${campaignId}/members`)
  113 |   await expect(page.getByText('new@example.com', { exact: true })).toBeVisible()
  114 |   await page.getByRole('button', { name: 'Cancelar invitación', exact: true }).click()
  115 |   await page.getByRole('dialog').getByRole('button', { name: 'Confirmar', exact: true }).click()
  116 |   await expect(page.getByText('No hay invitaciones pendientes para esta campaña.')).toBeVisible()
  117 |   await page.getByRole('button', { name: 'Nombrar DM', exact: true }).click()
  118 |   await page.keyboard.press('Escape')
  119 |   await expect(page.getByRole('button', { name: 'Nombrar DM', exact: true })).toBeFocused()
  120 |   await page.keyboard.press('Enter')
  121 |   await page.getByRole('dialog').getByRole('button', { name: 'Confirmar', exact: true }).click()
  122 |   await expect(page.getByRole('button', { name: 'Abandonar campaña', exact: true })).toBeEnabled()
  123 |   await page.getByRole('button', { name: /Sesión de/ }).click()
  124 |   await page.getByRole('menuitem', { name: 'Mis campañas', exact: true }).click()
  125 |   await page.getByRole('link', { name: 'Abrir campaña: Winter at the Keep' }).click()
  126 |   expect(page.url()).toContain(otherCampaignId)
  127 |   const mobileMenu = page.getByRole('button', { name: 'Abrir navegación' })
  128 |   const drawer = await mobileMenu.isVisible()
  129 |   if (drawer) await mobileMenu.click()
  130 |   const currentNav = drawer
  131 |     ? page.getByRole('dialog').getByRole('navigation')
  132 |     : page.locator('.sidebar nav')
  133 |   await expect(currentNav.getByText('Inventario', { exact: false })).toHaveAttribute(
  134 |     'aria-disabled',
  135 |     'true',
  136 |   )
  137 |   if (drawer) await page.keyboard.press('Escape')
  138 |   await page.goto(`./#/campaign/${campaignId}/members`)
  139 |   await page.getByRole('button', { name: 'Abandonar campaña', exact: true }).click()
  140 |   await page.getByRole('dialog').getByRole('button', { name: 'Confirmar', exact: true }).click()
  141 |   await expect(page.getByText('Esta campaña no está disponible para tu cuenta.')).toBeVisible()
  142 |   expect(
  143 |     f.calls.some((c) => c.method === 'change_campaign_member' && c.body.new_role === null),
  144 |   ).toBe(true)
  145 | })
  146 |
  147 | test('Player has no management payload or controls; revoked campaign fails closed', async ({
  148 |   page,
  149 | }) => {
  150 |   const f = await identityFixture(page, { player: true })
  151 |   await page.goto(`./#/campaign/${campaignId}/members`)
  152 |   await expect(page.getByText('Tu DM gestiona los miembros y las invitaciones.')).toBeVisible()
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
> 165 |   await expect(page.getByText('dm@example.com', { exact: true })).toBeVisible()
      |                                                                   ^ Error: expect(locator).toBeVisible() failed
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
  253 |         ).toBeVisible()
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
```
