import { chromium, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { identityFixture } from '../../../../tests/e2e/fixtures/identity.ts'
import { mkdirSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const out = 'docs/evidence/RYT-019/reviewer'
mkdirSync(`${out}/captures`, { recursive: true })
const digest = execFileSync(process.execPath, ['scripts/check-ui-review.mjs', '--fingerprint'], { encoding: 'utf8' }).trim()
const browser = await chromium.launch()
const results = { sourceDigest: digest, matrix: [], failure: null }
const base = 'http://127.0.0.1:4175/rytta-dnd-app/'

async function capture(page, name) {
  const overflow = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }))
  const axe = (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations
    .map(v => ({ id: v.id, impact: v.impact, targets: v.nodes.map(n => n.target) }))
  await page.screenshot({ path: `${out}/captures/${name}.png`, fullPage: true })
  expect(overflow.document, name).toBeLessThanOrEqual(overflow.viewport)
  expect(axe, name).toEqual([])
  return { name, overflow, axe }
}

try {
  for (const [width, language, scheme] of [[390,'es','dark'],[390,'en','light'],[820,'es','light'],[820,'en','dark']]) {
    const es = language === 'es'
    const context = await browser.newContext({ viewport: { width, height: 1000 }, hasTouch: true, reducedMotion: 'reduce' })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', e => errors.push(e.message))
    await page.addInitScript(({ language, scheme }) => {
      localStorage.setItem('rytta-language', language)
      localStorage.setItem('rytta-color-scheme', scheme)
    }, { language, scheme })
    const fixture = await identityFixture(page)
    await page.goto(base)
    const homeName = es ? 'Mis campañas' : 'My campaigns'
    await expect(page.getByRole('heading', {name:homeName,exact:true})).toBeVisible()
    await expect(page.locator('main').getByText(es ? 'Mi cuenta' : 'My account',{exact:true})).toHaveCount(0)
    await expect(page.locator('main').getByRole('button',{name:es?'Cerrar sesión':'Sign out',exact:true})).toHaveCount(0)
    const tag = `${width}-${language}-${scheme}`
    const row = { tag, captures: [], checks: [], errors }
    results.matrix.push(row)
    row.captures.push(await capture(page, `home-100-${tag}`))
    await page.addStyleTag({content:'html {font-size:150%}'} )
    row.captures.push(await capture(page, `home-150-${tag}`))

    const menu = page.getByRole('button',{name:es?'Abrir menú de ajustes':'Open settings menu'})
    await menu.focus()
    await menu.press('Enter')
    const settings = page.getByRole('menuitem',{name:es?'Ajustes':'App setup',exact:true})
    await expect(settings).toBeFocused()
    await expect(page.getByRole('menuitem')).toHaveCount(1)
    const menuBox = await page.getByRole('menu').boundingBox()
    expect(menuBox.height).toBeLessThan(180)
    // Mantine scales the specified width with root text size; constrain it to viewport.
    expect(menuBox.width).toBeLessThanOrEqual(Math.min(330, width-32))
    expect(menuBox.x+menuBox.width).toBeLessThanOrEqual(width)
    row.captures.push(await capture(page, `menu-150-${tag}`))
    await page.keyboard.press('Escape')
    await expect(menu).toBeFocused()
    await menu.click()
    await page.getByRole('heading',{name:homeName,exact:true}).click()
    await expect(page.getByRole('menu')).not.toBeVisible()
    await menu.click()
    await settings.click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('combobox',{name:es?'Idioma':'Language'})).toBeVisible()
    const radio = dialog.getByRole('radio',{name: scheme==='dark' ? (es?'Oscuro':'Dark') : (es?'Claro':'Light'),exact:true})
    await expect(radio).toBeChecked()
    const labels = dialog.getByRole('radiogroup',{name:es?'Apariencia':'Appearance'}).locator('label')
    const sizes = await labels.evaluateAll(nodes => nodes.map(n=>({width:n.getBoundingClientRect().width,height:n.getBoundingClientRect().height,icons:n.querySelectorAll('svg').length})))
    expect(sizes.every(s=>s.width>=44 && s.height>=44 && s.icons===1)).toBe(true)
    for(let i=0;i<12;i++) {
      await page.keyboard.press('Tab')
      expect(await page.evaluate(()=>document.activeElement.closest('[role="dialog"]') !== null)).toBe(true)
    }
    row.captures.push(await capture(page, `preferences-150-${tag}`))
    const nextScheme = scheme==='dark'?'light':'dark'
    const nextName = nextScheme==='dark'?(es?'Oscuro':'Dark'):(es?'Claro':'Light')
    await labels.filter({hasText:new RegExp(`^${nextName}$`)}).click()
    await expect(page.locator('html')).toHaveAttribute('data-mantine-color-scheme',nextScheme)
    await page.keyboard.press('Escape')
    await expect(menu).toBeFocused()
    row.checks.push({menuBox,themeTargets:sizes,keyboard:'menu Enter/Escape, outside close, 12 trapped Tabs, modal Escape',themeChanged:nextScheme})

    // Switching from the settings menu to account must not strand keyboard focus.
    await menu.click()
    const account = page.getByRole('button',{name:es?'Sesión de dm@example.com':'Signed in as dm@example.com'})
    await account.click()
    await expect(page.getByRole('menuitem',{name:es?'Cerrar sesión':'Sign out',exact:true})).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(account).toBeFocused()
    row.checks.push({accountSwitchAndEscape:true})

    const decline = page.getByRole('button',{name:es?'Rechazar':'Decline',exact:true})
    await decline.click()
    await expect(page.getByRole('dialog')).toContainText('The Amber Road')
    await page.keyboard.press('Escape')
    await expect(decline).toBeFocused()
    await decline.click()
    await page.getByRole('dialog').getByRole('button',{name:es?'Confirmar':'Confirm',exact:true}).click()
    await expect(page.getByText(es?'No tienes invitaciones pendientes.':'No pending invitations.',{exact:true})).toBeVisible()
    expect(fixture.calls.filter(c=>c.method==='respond_campaign_invitation' && c.body.accept_invitation===false)).toHaveLength(1)
    row.captures.push(await capture(page, `empty-after-decline-${tag}`))
    await account.click()
    await page.getByRole('menuitem',{name:es?'Cerrar sesión':'Sign out',exact:true}).click()
    await expect(page.getByRole('button',{name:es?'Continuar con Google':'Continue with Google',exact:true})).toBeVisible()
    row.checks.push({declineConfirmed:true,accountLogout:true})
    expect(errors).toEqual([])
    await context.close()
  }

  // Independent deferred loading/error/recovery fixture and accept action on a phone.
  const context = await browser.newContext({viewport:{width:390,height:1000},hasTouch:true,reducedMotion:'reduce'})
  const page = await context.newPage()
  const fixture = await identityFixture(page)
  let release
  const pending = new Promise(resolve=>release=resolve)
  let fail = false
  await page.route('https://rytta-test.supabase.co/rest/v1/rpc/list_my_invitations',async route=>{
    await pending
    if(fail) return route.fulfill({status:503,contentType:'application/json',body:'{"message":"Unavailable"}'})
    return route.fallback()
  })
  await page.goto(base)
  const panel = page.getByRole('region',{name:'Unirse a una campaña'})
  await expect(panel.getByRole('status')).toBeVisible()
  results.loading = await capture(page,'loading-phone')
  release()
  await expect(panel.getByRole('button',{name:'Aceptar invitación'})).toBeVisible()
  fail=true
  await panel.getByRole('button',{name:'Actualizar',exact:true}).click()
  await expect(panel.getByRole('alert')).toBeVisible()
  await expect(panel.getByRole('button',{name:'Aceptar invitación'})).toHaveCount(0)
  results.failedRefresh = await capture(page,'failed-refresh-phone')
  fail=false
  await panel.getByRole('button',{name:'Reintentar'}).click()
  await expect(panel.getByRole('button',{name:'Aceptar invitación'})).toBeVisible()
  await panel.getByRole('button',{name:'Aceptar invitación'}).click()
  await expect(page.getByRole('link',{name:'Abrir campaña: The Amber Road',exact:true})).toBeVisible()
  expect(fixture.calls.filter(c=>c.method==='respond_campaign_invitation' && c.body.accept_invitation===true)).toHaveLength(1)
  results.acceptAndRecovery = true
  await context.close()
  const finalDigest = execFileSync(process.execPath,['scripts/check-ui-review.mjs','--fingerprint'],{encoding:'utf8'}).trim()
  expect(finalDigest).toBe(digest)
} catch(error) {
  results.failure = {message:error.message,stack:error.stack}
  process.exitCode = 1
} finally {
  writeFileSync(`${out}/results.json`,JSON.stringify(results,null,2)+'\n')
  await browser.close()
}
