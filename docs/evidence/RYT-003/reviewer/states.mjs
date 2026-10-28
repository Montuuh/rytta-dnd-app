import { chromium, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { identityFixture, campaignId } from '../../../../tests/e2e/fixtures/identity.ts'
import { writeFileSync } from 'node:fs'
const browser=await chromium.launch();const result=[]
const out='docs/evidence/RYT-003/reviewer'
for(const scenario of ['dm-empty','player-empty','error-retry','signed-out','stale']) {
 const ctx=await browser.newContext({viewport:{width:390,height:844},hasTouch:true})
 const page=await ctx.newPage();const f=await identityFixture(page,{player:scenario==='player-empty',signedIn:scenario!=='signed-out'})
 let failed=scenario==='error-retry'
 if(scenario.includes('empty')||failed) await page.route('**/rest/v1/characters?**',r=>r.fulfill({status:failed?503:200,contentType:'application/json',body:failed?JSON.stringify({message:'Unavailable'}):'[]'}))
 await page.goto('http://127.0.0.1:4175/rytta-dnd-app/'+(scenario==='signed-out'?'':`#/campaign/${campaignId}/party`))
 if(scenario.includes('empty')) await expect(page.getByText(scenario==='dm-empty'?'Todavía no hay personajes.':'Tu DM todavía no te ha asignado un personaje.')).toBeVisible()
 if(scenario==='error-retry') {
   await expect(page.getByRole('alert')).toContainText('No se pudo cargar', { timeout: 20000 });failed=false
   await page.getByRole('button',{name:'Reintentar'}).click()
   await expect(page.getByText('Todavía no hay personajes.')).toBeVisible()
 }
 if(scenario==='signed-out') {
   await expect(page.getByRole('button',{name:'Continuar con Google'})).toBeVisible()
   await page.getByRole('button',{name:'Abrir menú de cuenta y ajustes'}).click()
   await expect(page.getByRole('combobox',{name:'Idioma'})).toBeVisible()
   await page.keyboard.press('Escape')
 }
 if(scenario==='stale') {
   await page.getByRole('button',{name:'Editar recursos'}).click();f.staleResources()
   await page.getByRole('textbox',{name:'Oro',exact:true}).fill('90')
   await page.getByRole('button',{name:'Guardar recursos'}).click()
   await expect(page.getByRole('alert')).toContainText('Otro DM')
   await expect(page.getByRole('button',{name:'Guardar recursos'})).toBeDisabled()
   await page.keyboard.press('Escape');await page.getByRole('button',{name:'Editar recursos'}).click()
   await expect(page.getByRole('textbox',{name:'Oro',exact:true})).toHaveValue('70')
   for(let i=0;i<12;i++){await page.keyboard.press('Tab');expect(await page.evaluate(()=>!!document.activeElement?.closest('[role="dialog"]'))).toBe(true)}
 }
 const audit=(await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations.map(v=>v.id)
 await page.screenshot({path:`${out}/state-${scenario}.png`,fullPage:true})
 result.push({scenario,axe:audit,passed:true})
 await ctx.close()
}
await browser.close();writeFileSync(`${out}/states-results.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result))
