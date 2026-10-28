# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: identity.spec.ts >> es light sign-in, hub and member screens fit and pass axe at 150% text
- Location: tests\e2e\identity.spec.ts:233:5

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false
```

# Page snapshot

```yaml
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
        - link "Campamento" [ref=e15] [cursor=pointer]:
          - /url: "#/campaign/20000000-0000-4000-8000-000000000001"
        - link "Grupo" [ref=e19] [cursor=pointer]:
          - /url: "#/campaign/20000000-0000-4000-8000-000000000001/party"
        - paragraph [ref=e25]:
          - text: Inventario
          - generic [ref=e30]: Módulo previsto
        - paragraph [ref=e31]:
          - text: Tiendas
          - generic [ref=e36]: Módulo previsto
        - paragraph [ref=e37]:
          - text: Misiones
          - generic [ref=e41]: Módulo previsto
        - paragraph [ref=e42]:
          - text: Combate
          - generic [ref=e52]: Módulo previsto
        - paragraph [ref=e53]:
          - text: Atlas
          - generic [ref=e56]: Módulo previsto
        - paragraph [ref=e57]:
          - text: Glosario
          - generic [ref=e60]: Módulo previsto
        - paragraph [ref=e61]:
          - text: Recuerdos
          - generic [ref=e66]: Módulo previsto
        - paragraph [ref=e67]:
          - text: Bastión
          - generic [ref=e70]: Módulo previsto
        - paragraph [ref=e71]:
          - text: Taller
          - generic [ref=e75]: Módulo previsto
        - link "Miembros e invitaciones" [ref=e76] [cursor=pointer]:
          - /url: "#/campaign/20000000-0000-4000-8000-000000000001/members"
    - generic [ref=e77]: Menos cuentas.Más aventuras.
  - generic [ref=e78]:
    - banner [ref=e79]:
      - generic:
        - paragraph: The Sunken Coast
      - generic [ref=e80]:
        - button "Vista Player" [ref=e81] [cursor=pointer]
        - button "Sesión de dm@example.com" [ref=e84] [cursor=pointer]:
          - generic [ref=e85]: dm@example.com
        - button "Abrir menú de ajustes" [ref=e92] [cursor=pointer]
    - main [active] [ref=e95]:
      - generic [ref=e97]:
        - generic [ref=e98]:
          - heading "Tu mesa" [level=1] [ref=e99]
          - paragraph [ref=e100]: Los DMs comparten la gestión de la campaña. Las invitaciones siempre dan el rol Player.
        - generic [ref=e101]:
          - heading "Vincular personaje" [level=2] [ref=e102]
          - paragraph [ref=e103]: "Table DM: Sin personaje"
          - paragraph [ref=e104]: "Arin: Sin personaje"
          - generic [ref=e106]:
            - generic [ref=e107]:
              - paragraph [ref=e108]: Arin
              - paragraph [ref=e109]: Sin jugador
            - button "Vincular personaje" [ref=e110] [cursor=pointer]
        - region [ref=e113]:
          - generic [ref=e114]:
            - generic [ref=e115]:
              - heading "Miembros" [level=2] [ref=e116]
              - button "Actualizar" [ref=e117] [cursor=pointer]
            - generic [ref=e121]:
              - generic [ref=e122]:
                - generic [ref=e123]:
                  - paragraph [ref=e124]: Table DM · Tú
                  - paragraph [ref=e125]: dm@example.com
                - generic [ref=e126]: DM
              - button "Cambiar a Player" [disabled] [ref=e129]
            - generic [ref=e133]:
              - generic [ref=e134]:
                - generic [ref=e135]:
                  - paragraph [ref=e136]: Arin
                  - paragraph [ref=e137]: player@example.com
                - generic [ref=e138]: Player
              - generic [ref=e140]:
                - button "Nombrar DM" [ref=e141] [cursor=pointer]
                - button "Retirar miembro" [ref=e144] [cursor=pointer]
        - region [ref=e147]:
          - generic [ref=e148]:
            - heading "Invitaciones pendientes" [level=2] [ref=e149]
            - paragraph [ref=e150]: No hay invitaciones pendientes para esta campaña.
        - generic [ref=e152]:
          - paragraph [ref=e153]: La campaña siempre necesita un DM. Nombra a otro miembro DM antes de dejar el rol o salir.
          - button "Abandonar campaña" [disabled] [ref=e154]
    - contentinfo [ref=e157]: Para quienes comparten tu mesa.
```

# Test source

```ts
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
  253 |         ).toBeVisible()
  254 |         await page.screenshot({
  255 |           path: testInfo.outputPath(`${screen}-${language}-${scheme}-100.png`),
  256 |           fullPage: true,
  257 |           scale: 'css',
  258 |         })
  259 |         await page.addStyleTag({ content: 'html { font-size: 150%; }' })
> 260 |         expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      |                                                                                               ^ Error: expect(received).toBe(expected) // Object.is equality
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
