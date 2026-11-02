import { chromium,expect } from '@playwright/test'
import { writeFileSync } from 'node:fs'
import { identityFixture,campaignId } from '../../../../tests/e2e/fixtures/identity.ts'
import { shopsFixture } from '../../../../tests/e2e/fixtures/shops.ts'
const base=process.env.REVIEW_BASE??'http://127.0.0.1:4184/rytta-dnd-app/'
const dir='docs/evidence/RYT-026/reviewer'
const b=await chromium.launch();const out=[]
try{
for(const [width,scale] of [[390,1.5],[390,1],[820,1.5]]){
 const sc=await b.newContext({viewport:{width,height:width===390?844:1180},hasTouch:true,reducedMotion:'reduce'});const sp=await sc.newPage();const f=await identityFixture(sp,{inventory:true,sheet:'complete'});await shopsFixture(sp,f)
 let n=0;await sp.route('**/rest/v1/rpc/save_listing',async route=>{n++;if(n===1)await new Promise(r=>setTimeout(r,2500));if(n===2)return route.fulfill({status:503,json:{message:'Unavailable'}});return route.fallback()})
 await sp.goto(`${base}#/campaign/${campaignId}/shops`)
 if(scale!==1) await sp.addStyleTag({content:`html{font-size:${scale*100}%}`})
 await sp.getByRole('button',{name:'Añadir objeto',exact:true}).click()
 const picks=sp.locator('.pick-tile');await picks.nth(0).click();await picks.nth(1).click()
 const add=sp.getByRole('button',{name:'Añadir 2 objetos',exact:true});await add.focus();await sp.keyboard.press('Enter');await sp.waitForTimeout(400)
 const box=await add.boundingBox()
 const loader=await sp.evaluate(()=>{const l=document.activeElement.querySelector('.mantine-Loader-root');if(!l)return null;const r=l.getBoundingClientRect();const cs=getComputedStyle(l);return{w:r.width,h:r.height,color:cs.color,display:cs.display,visibility:cs.visibility,loaderVar:cs.getPropertyValue('--loader-color')}})
 const tile=await sp.evaluate(()=>{const t=document.querySelector('.pick-tile');return{disabled:t.disabled,opacity:getComputedStyle(t).opacity}})
 await sp.screenshot({path:`${dir}/round3-${width}-${scale*100}-busy-button.png`,clip:{x:0,y:Math.max(0,box.y-20),width,height:box.height+40}})
 await expect(sp.getByRole('dialog').getByRole('alert')).toBeVisible({timeout:8000})
 const alert=sp.getByRole('dialog').getByRole('alert')
 const geo=await sp.evaluate(()=>{const a=document.querySelector('[role=dialog] [role=alert]').getBoundingClientRect();const d=document.querySelector('.pick-dock').getBoundingClientRect();const top=document.elementFromPoint(a.x+a.width/2,a.y+a.height/2);return{alert:{top:a.top,bottom:a.bottom},dock:{top:d.top,bottom:d.bottom},overlap:Math.max(0,Math.min(a.bottom,d.bottom)-Math.max(a.top,d.top)),centerHitIsAlert:!!top?.closest('[role=alert]'),active:document.activeElement.textContent}})
 await sp.screenshot({path:`${dir}/round3-${width}-${scale*100}-partial-error-viewport.png`})
 await alert.scrollIntoViewIfNeeded()
 const geo2=await sp.evaluate(()=>{const a=document.querySelector('[role=dialog] [role=alert]').getBoundingClientRect();const top=document.elementFromPoint(a.x+a.width/2,a.y+a.height/2);return{alertTop:a.top,centerHitIsAlert:!!top?.closest('[role=alert]')}})
 await sp.screenshot({path:`${dir}/round3-${width}-${scale*100}-partial-error-scrolled.png`})
 out.push({width,scale,loader,tile,geo,afterScroll:geo2})
 await sc.close()
}}catch(e){out.push({fatal:e.stack})}finally{await b.close();writeFileSync(`${dir}/round3-probe.json`,JSON.stringify(out,null,2));console.log(JSON.stringify(out,null,2))}
