# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: characters.spec.ts >> DM creates before assignment, invites, edits whole homebrew units and recovers from a stale editor
- Location: tests\e2e\characters.spec.ts:5:1

# Error details

```
Error: expect(locator).toBeFocused() failed

Locator:  getByRole('button', { name: 'Crear personaje', exact: true })
Expected: focused
Received: inactive
Timeout:  5000ms

Call log:
  - Expect "toBeFocused" getByRole('button', { name: 'Crear personaje', exact: true }) with timeout 5000ms
  - waiting for getByRole('button', { name: 'Crear personaje', exact: true })
    14 × locator resolved to <button type="button" data-size="md" class="mantine-focus-auto mantine-active m_77c9d27d mantine-Button-root m_87cf2631 mantine-UnstyledButton-root">…</button>
       - unexpected value "inactive"

```

```yaml
- button "Crear personaje"
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test'
  2  | import AxeBuilder from '@axe-core/playwright'
  3  | import { identityFixture, campaignId } from './fixtures/identity.ts'
  4  |
  5  | test('DM creates before assignment, invites, edits whole homebrew units and recovers from a stale editor', async ({page}) => {
  6  |   const f=await identityFixture(page)
  7  |   await page.goto(`./#/campaign/${campaignId}/party`)
  8  |   const create=page.getByRole('button',{name:'Crear personaje',exact:true})
  9  |   await create.click()
  10 |   await expect(page.getByLabel('Nombre del personaje')).toBeFocused()
> 11 |   await page.keyboard.press('Escape'); await expect(create).toBeFocused()
     |                                                             ^ Error: expect(locator).toBeFocused() failed
  12 |   await create.click(); await page.getByLabel('Nombre del personaje').fill('New hero')
  13 |   await page.getByRole('dialog').getByRole('button',{name:'Crear personaje',exact:true}).click()
  14 |   const card=page.locator('.character-card').filter({has:page.getByRole('heading',{name:'New hero'})})
  15 |   await expect(card.getByText('Sin jugador')).toBeVisible()
  16 |   await card.getByRole('button',{name:'Invitar jugador'}).click()
  17 |   await page.getByLabel('Correo de la cuenta de Google').fill('future@example.com')
  18 |   await page.getByRole('dialog').getByRole('button',{name:'Invitar jugador'}).click()
  19 |   await expect(page.getByRole('status')).toContainText('Invitación creada')
  20 |   expect(f.calls.find(c=>c.method==='invite_character_player')?.body.target_character).toBeTruthy()
  21 |   const arin=page.locator('.character-card').filter({has:page.getByRole('heading',{name:'Arin',exact:true})})
  22 |   await arin.getByRole('button',{name:'Editar recursos'}).click()
  23 |   await page.getByLabel('Oro',{exact:true}).fill('99')
  24 |   await page.getByLabel('Agotamiento',{exact:true}).fill('12')
  25 |   await page.getByRole('button',{name:'Guardar recursos'}).click()
  26 |   await expect(arin.getByText('99',{exact:true})).toBeVisible()
  27 |   await arin.getByRole('button',{name:'Editar recursos'}).click()
  28 |   f.staleResources()
  29 |   await page.getByLabel('Oro',{exact:true}).fill('100')
  30 |   await page.getByRole('button',{name:'Guardar recursos'}).click()
  31 |   await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Otro DM')
  32 |   await expect(page.getByRole('button',{name:'Guardar recursos'})).toBeDisabled()
  33 |   await page.keyboard.press('Escape')
  34 |   await page.getByRole('button',{name:'Actualizar',exact:true}).click()
  35 |   await expect(arin.getByText('70',{exact:true})).toBeVisible()
  36 | })
  37 |
  38 | test('Player sees own resources read-only; account menu returns home without leaving membership', async ({page}) => {
  39 |   const f=await identityFixture(page,{player:true})
  40 |   await page.goto(`./#/campaign/${campaignId}/party`)
  41 |   await expect(page.getByText('Tu personaje',{exact:true})).toBeVisible()
  42 |   await expect(page.getByRole('button',{name:'Editar recursos'})).toHaveCount(0)
  43 |   await expect(page.getByRole('button',{name:'Crear personaje'})).toHaveCount(0)
  44 |   const menu=page.getByRole('button',{name:'Abrir menú de cuenta y ajustes'})
  45 |   await menu.click(); await page.keyboard.press('Escape'); await expect(menu).toBeFocused()
  46 |   await menu.press('Enter')
  47 |   await page.getByRole('dialog').getByRole('link',{name:'Sesión de player@example.com'}).click()
  48 |   await expect(page.getByRole('heading',{name:'Mis campañas',exact:true})).toBeVisible()
  49 |   expect(f.calls.filter(c=>c.method==='change_campaign_member')).toHaveLength(0)
  50 |   await page.getByRole('button',{name:'Cerrar sesión',exact:true}).click()
  51 |   await expect(page.getByRole('button',{name:'Continuar con Google'})).toBeVisible()
  52 | })
  53 |
  54 | for(const language of ['es','en'] as const) for(const scheme of ['dark','light'] as const)
  55 | test(`${language} ${scheme} party, editor and account menu at 150% text`,async({page},info)=>{
  56 |   await page.addInitScript(({language,scheme})=>{localStorage.setItem('rytta-language',language);localStorage.setItem('rytta-color-scheme',scheme)},{language,scheme})
  57 |   const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message))
  58 |   await identityFixture(page);await page.emulateMedia({reducedMotion:'reduce'})
  59 |   await page.goto(`./#/campaign/${campaignId}/party`)
  60 |   await expect(page.getByRole('heading',{name:'Arin',exact:true})).toBeVisible()
  61 |   await page.screenshot({path:info.outputPath(`party-${language}-${scheme}-100.png`),fullPage:true})
  62 |   await page.addStyleTag({content:'html { font-size: 150%; }'})
  63 |   for(const screen of ['party','editor','menu']) {
  64 |     if(screen==='editor') await page.getByRole('button',{name:language==='es'?'Editar recursos':'Edit resources'}).click()
  65 |     if(screen==='menu') {await page.keyboard.press('Escape');await page.getByRole('button',{name:language==='es'?'Abrir menú de cuenta y ajustes':'Open account and settings menu'}).click()}
  66 |     expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
  67 |     expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations).toEqual([])
  68 |     await page.screenshot({path:info.outputPath(`${screen}-${language}-${scheme}-150.png`),fullPage:true})
  69 |   }
  70 |   expect(errors).toEqual([])
  71 | })
  72 |
```
