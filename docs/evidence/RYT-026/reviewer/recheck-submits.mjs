import { chromium,expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { writeFileSync } from 'node:fs'
import { identityFixture,campaignId } from '../../../../tests/e2e/fixtures/identity.ts'
import { shopsFixture } from '../../../../tests/e2e/fixtures/shops.ts'
const b=await chromium.launch();const results=[]
const base='http://127.0.0.1:4184/rytta-dnd-app/'
const dir='docs/evidence/RYT-026/reviewer'
try{
for(const width of [390,1440]){
 for(const kind of ['give','shop','gold','gold-stale']){
 const c=await b.newContext({viewport:{width,height:width===390?844:1000},reducedMotion:'reduce'});const p=await c.newPage();const f=await identityFixture(p,{inventory:true,sheet:'complete'});await shopsFixture(p,f)
 const method=kind==='give'?'grant_item':kind==='shop'?'save_listing':'set_character_resources';let attempted=false
 await p.route(`**/rest/v1/rpc/${method}`,async route=>{if(!attempted){attempted=true;return route.fulfill({status:kind==='gold-stale'?400:503,json:{message:kind==='gold-stale'?'Stale revision':'Unavailable'}})}return route.fallback()})
 await p.goto(`${base}#/campaign/${campaignId}/${kind.startsWith('gold')?'party':'items'}`)
 if(kind.startsWith('gold')){await p.getByRole('button',{name:/Editar oro de Arin/}).click();await p.getByRole('textbox',{name:'Oro',exact:true}).fill('500')}
 else{
 const card=p.locator('.mantine-Paper-root').filter({has:p.getByRole('heading',{name:'Armadura de cuero',exact:true})})
 await card.getByRole('button',{name:kind==='give'?'Dar a personajes':'Añadir a tienda',exact:true}).click()
 await p.getByRole('combobox',{name:kind==='give'?'Personaje':'Tienda',exact:true}).click();await p.getByRole('option',{name:kind==='give'?'Arin':'Mercado del puerto',exact:true}).click()
 }
 const submit=p.getByRole('dialog').getByRole('button',{name:kind.startsWith('gold')?'Guardar':kind==='give'?'Dar a personajes':'Añadir a tienda',exact:true});await submit.focus();await p.keyboard.press('Enter')
 const alert=p.getByRole('dialog').getByRole('alert');await expect(alert).toBeVisible()
 if(kind.startsWith('gold'))await expect(alert).toBeFocused();else await expect(p.getByRole('dialog').getByRole('button',{name:'Reintentar',exact:true})).toBeFocused()
 const axe=await new AxeBuilder({page:p}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()
 await p.screenshot({path:`${dir}/round3-${width}-${kind}-error.png`,fullPage:true})
 if(kind==='gold-stale'){await expect(p.getByRole('button',{name:'Reintentar',exact:true})).toBeDisabled();await p.keyboard.press('Escape');await expect(p.getByRole('dialog')).toHaveCount(0)}else{await p.getByRole('dialog').getByRole('button',{name:'Reintentar',exact:true}).click();await expect(p.getByRole('dialog')).toHaveCount(0)}
 results.push({width,kind,errorFocus:true,recovery:true,axe:axe.violations.map(v=>v.id)});await c.close()
 }
}
}catch(error){results.push({fatal:error.stack})}finally{await b.close();writeFileSync(`${dir}/round3-submits-results.json`,JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2))}
