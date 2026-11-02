import { chromium,expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { writeFileSync } from 'node:fs'
import { identityFixture,campaignId } from '../../../../tests/e2e/fixtures/identity.ts'
import { shopsFixture } from '../../../../tests/e2e/fixtures/shops.ts'
const base=process.env.REVIEW_BASE;const dir='docs/evidence/RYT-026/reviewer'
const b=await chromium.launch();const out=[]
const style=(sel)=>`(()=>{const el=${sel};const cs=getComputedStyle(el);const l=el.querySelector('.mantine-Loader-root');const lc=l&&getComputedStyle(l);return{text:el.textContent,ariaDisabled:el.getAttribute('aria-disabled'),ariaBusy:el.getAttribute('aria-busy'),disabled:el.disabled,opacity:cs.opacity,cursor:cs.cursor,bg:cs.backgroundColor,color:cs.color,loader:l?{w:l.getBoundingClientRect().width,var:lc.getPropertyValue('--loader-color'),color:lc.color}:null}})()`
const ctx=async(width)=>{const c=await b.newContext({viewport:{width,height:width===390?844:1180},hasTouch:true,reducedMotion:'reduce'});const p=await c.newPage();return [c,p]}
try{
for(const [width,scale] of (process.env.ONLY_P3?[]:[[390,1],[390,1.5],[820,1],[820,1.5],[1440,1]])){
 const [sc,sp]=await ctx(width);const f=await identityFixture(sp,{inventory:true,sheet:'complete'});await shopsFixture(sp,f)
 let n=0;await sp.route('**/rest/v1/rpc/save_listing',async route=>{n++;if(n===1)await new Promise(r=>setTimeout(r,2500));if(n===2)return route.fulfill({status:503,json:{message:'Unavailable'}});return route.fallback()})
 await sp.goto(`${base}#/campaign/${campaignId}/shops`)
 if(scale!==1) await sp.addStyleTag({content:`html{font-size:${scale*100}%}`})
 await sp.getByRole('button',{name:'Añadir objeto',exact:true}).click()
 const picks=sp.locator('.pick-tile');await picks.nth(0).click();await picks.nth(1).click()
 const add=sp.getByRole('button',{name:'Añadir 2 objetos',exact:true});await add.focus();await sp.keyboard.press('Enter');await sp.waitForTimeout(400)
 const busy=await sp.evaluate(style('document.activeElement'))
 const tiles=await sp.evaluate(()=>[...document.querySelectorAll('.pick-tile')].map(t=>({disabled:t.disabled,opacity:getComputedStyle(t).opacity})))
 const box=await add.boundingBox()
 await sp.screenshot({path:`${dir}/round4-${width}-${scale*100}-busy.png`})
 await sp.screenshot({path:`${dir}/round4-${width}-${scale*100}-busy-button.png`,clip:{x:0,y:Math.max(0,box.y-20),width,height:box.height+40}})
 await expect(sp.getByRole('dialog').getByRole('alert')).toBeVisible({timeout:8000})
 const geo=await sp.evaluate(()=>{const a=document.querySelector('[role=dialog] [role=alert]').getBoundingClientRect();const d=document.querySelector('.pick-dock').getBoundingClientRect();const content=document.querySelector('.mantine-Drawer-content').getBoundingClientRect();const hit=document.elementFromPoint(a.x+a.width/2,a.y+a.height/2);const grid=[...document.querySelectorAll('.pick-tile')].map(t=>{const r=t.getBoundingClientRect();return{top:Math.round(r.top),bottom:Math.round(r.bottom)}});return{alert:{top:a.top,bottom:a.bottom,inViewport:a.top>=0&&a.bottom<=innerHeight},alertHit:!!hit?.closest('[role=alert]'),dock:{top:d.top,bottom:d.bottom,height:d.height},drawer:{top:content.top,bottom:content.bottom,height:content.height},dockShareOfDrawer:+(d.height/content.height).toFixed(2),grid,active:document.activeElement.textContent,alertText:document.querySelector('[role=dialog] [role=alert]').textContent}})
 const afterStyle=await sp.evaluate(style('document.activeElement'))
 const axe=(await new AxeBuilder({page:sp}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations.map(v=>v.id)
 await sp.screenshot({path:`${dir}/round4-${width}-${scale*100}-partial-error-viewport.png`})
 await sp.getByRole('button',{name:'Añadir 1 objeto',exact:true}).click();await expect(sp.getByRole('dialog')).toHaveCount(0)
 out.push({flow:'shop-add',width,scale,busy,tiles,geo,afterFailureButton:afterStyle,axe,requests:n})
 await sc.close()
}
// P3 spot-checks at 390: give-to-character (campaign-items-page) and add-to-shop (catalogue-shop-picker)
{
 const [c,p]=await ctx(390);const f=await identityFixture(p,{inventory:true,sheet:'complete'});await shopsFixture(p,f)
 await p.route('**/rest/v1/rpc/grant_item',async r=>{await new Promise(x=>setTimeout(x,2500));return r.fallback()})
 await p.goto(`${base}#/campaign/${campaignId}/items`)
 await p.getByRole('button',{name:'Crear objeto',exact:true}).click()
 await p.getByRole('textbox',{name:'Nombre',exact:true}).fill('Review charm')
 await p.getByRole('button',{name:'Forjar objeto',exact:true}).click()
 const card=p.locator('.mantine-Paper-root').filter({has:p.getByRole('heading',{name:'Review charm',exact:true})})
 await card.getByRole('button',{name:'Dar a personajes'}).click()
 await p.getByRole('combobox',{name:'Personaje',exact:true}).click();await p.getByRole('option',{name:'Arin',exact:true}).click()
 await p.getByRole('textbox',{name:'Cantidad',exact:true}).fill('1')
 const give=p.getByRole('dialog').getByRole('button',{name:'Dar a personajes'});await give.focus();await p.keyboard.press('Enter');await p.waitForTimeout(400)
 const giveBusy=await p.evaluate(style('document.activeElement'))
 const gb=await p.evaluate(()=>{const r=document.activeElement.getBoundingClientRect();return{y:r.y,height:r.height}});const dialogs=await p.evaluate(()=>[...document.querySelectorAll('[role=dialog]')].map(d=>d.getAttribute('aria-label')||d.textContent.slice(0,40)));console.error('dialogs',JSON.stringify(dialogs),JSON.stringify(giveBusy));await p.screenshot({path:`${dir}/round4-390-give-busy-button.png`,clip:{x:0,y:Math.max(0,gb.y-20),width:390,height:gb.height+40}})
 await expect(p.getByRole('dialog')).toHaveCount(0,{timeout:8000})
 await p.route('**/rest/v1/rpc/save_listing',async r=>{await new Promise(x=>setTimeout(x,2500));return r.fallback()})
 await card.getByRole('button',{name:'Añadir a tienda'}).click()
 await p.getByRole('combobox',{name:'Tienda',exact:true}).click();await p.getByRole('option',{name:'Mercado del puerto',exact:true}).click()
 await p.getByRole('textbox',{name:'Precio en oro'}).fill('25')
 const shopBtn=p.getByRole('dialog').getByRole('button',{name:'Añadir a tienda',exact:true});await shopBtn.focus();await p.keyboard.press('Enter');await p.waitForTimeout(400)
 const shopBusy=await p.evaluate(style('document.activeElement'))
 const sb=await p.evaluate(()=>{const r=document.activeElement.getBoundingClientRect();return{y:r.y,height:r.height}});await p.screenshot({path:`${dir}/round4-390-catalogue-shop-busy-button.png`,clip:{x:0,y:Math.max(0,sb.y-20),width:390,height:sb.height+40}})
 await expect(p.getByRole('dialog')).toHaveCount(0,{timeout:8000})
 out.push({flow:'p3-spot',giveBusy,shopBusy})
 await c.close()
}
}catch(e){out.push({fatal:e.stack})}finally{await b.close();writeFileSync(`${dir}/round4-probe.json`,JSON.stringify(out,null,2));console.log(JSON.stringify(out))}
