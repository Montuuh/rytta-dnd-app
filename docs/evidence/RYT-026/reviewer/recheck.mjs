import { chromium,expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { writeFileSync } from 'node:fs'
import { identityFixture,campaignId } from '../../../../tests/e2e/fixtures/identity.ts'
import { shopsFixture } from '../../../../tests/e2e/fixtures/shops.ts'
const b=await chromium.launch();const results=[]
const base='http://127.0.0.1:4184/rytta-dnd-app/'
const dir='docs/evidence/RYT-026/reviewer'
try{
for(const width of [390,820]){
 const c=await b.newContext({viewport:{width,height:width===390?844:1180},hasTouch:true,reducedMotion:'reduce'});const p=await c.newPage()
 await identityFixture(p,{player:true,inventory:true,sheet:'complete'})
 let failed=false
 await p.route('**/rest/v1/rpc/unequip_item',async route=>{if(!failed){failed=true;return route.fulfill({status:503,json:{message:'Unavailable'}})}return route.fallback()})
 await p.goto(`${base}#/campaign/${campaignId}/inventory?view=equipment`)
 const remove=p.getByRole('button',{name:'Quitar Armadura de cuero',exact:true})
 await remove.focus();await p.keyboard.press('Enter');await expect(p.getByRole('alert')).toBeVisible();await expect(remove).toBeFocused()
 await p.screenshot({path:`${dir}/round2-${width}-unequip-error.png`,fullPage:true})
 await p.keyboard.press('Enter');const socket=p.getByRole('button',{name:'Torso: vacío',exact:true});await expect(socket).toBeFocused();await expect(p.getByRole('img',{name:'Clase de Armadura 13'})).toBeVisible()
 await p.screenshot({path:`${dir}/round2-${width}-unequip-success.png`,fullPage:true})
 results.push({width,unequipFailureFocus:true,unequipSuccessSocketFocus:true})
 await c.close()
 const sc=await b.newContext({viewport:{width,height:width===390?844:1180},hasTouch:true,reducedMotion:'reduce'});const sp=await sc.newPage();const f=await identityFixture(sp,{inventory:true,sheet:'complete'});await shopsFixture(sp,f)
 let attempts=0;const requests=[]
 await sp.route('**/rest/v1/rpc/save_listing',async route=>{requests.push(route.request().postDataJSON());if(++attempts===2)return route.fulfill({status:503,json:{message:'Unavailable'}});return route.fallback()})
 await sp.goto(`${base}#/campaign/${campaignId}/shops`);await sp.getByRole('button',{name:'Añadir objeto',exact:true}).click()
 const picks=sp.locator('.pick-tile');const first=await picks.nth(0).textContent();const second=await picks.nth(1).textContent();await picks.nth(0).click();await picks.nth(1).click()
 const add=sp.getByRole('button',{name:'Añadir 2 objetos',exact:true});await add.focus();await sp.keyboard.press('Enter')
 await expect(sp.getByRole('dialog').getByRole('alert')).toBeVisible();await expect(sp.getByRole('button',{name:'Añadir 1 objeto',exact:true})).toBeEnabled()
 const selected=await sp.locator('.pick-tile[aria-pressed=true]').allTextContents()
 const active=await sp.evaluate(()=>({tag:document.activeElement.tagName,text:document.activeElement.textContent?.slice(0,80)}))
 if(width===390) await sp.addStyleTag({content:'html{font-size:150%}'})
 const axe=await new AxeBuilder({page:sp}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()
 await sp.screenshot({path:`${dir}/round2-${width}-shop-partial-error.png`,fullPage:true})
 await sp.getByRole('button',{name:'Añadir 1 objeto',exact:true}).click();await expect(sp.getByRole('dialog')).toHaveCount(0)
 expect(requests).toHaveLength(3);expect(requests[1].request_id).toBe(requests[2].request_id)
 results.push({width,partialRecovery:true,first,second,selected,activeAfterFailure:active,axe:axe.violations.map(v=>v.id),requestIds:requests.map(r=>r.request_id)})
 await sc.close()
}
}catch(error){results.push({fatal:error.stack})}finally{await b.close();writeFileSync(`${dir}/round2-results.json`,JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2))}
