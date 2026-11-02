import { chromium,expect } from '@playwright/test'
import { identityFixture,campaignId } from '../../../../tests/e2e/fixtures/identity.ts'
import { shopsFixture } from '../../../../tests/e2e/fixtures/shops.ts'
const base=process.env.REVIEW_BASE;const dir='docs/evidence/RYT-026/reviewer'
const b=await chromium.launch()
try{
 const sc=await b.newContext({viewport:{width:390,height:844},hasTouch:true,reducedMotion:'reduce'});const sp=await sc.newPage();const f=await identityFixture(sp,{inventory:true,sheet:'complete'});await shopsFixture(sp,f)
 let n=0;await sp.route('**/rest/v1/rpc/save_listing',async route=>{if(++n===2)return route.fulfill({status:503,json:{message:'Unavailable'}});return route.fallback()})
 await sp.goto(`${base}#/campaign/${campaignId}/shops`);await sp.addStyleTag({content:'html{font-size:150%}'})
 await sp.getByRole('button',{name:'Añadir objeto',exact:true}).click()
 const picks=sp.locator('.pick-tile');await picks.nth(0).click();await picks.nth(1).click()
 await sp.getByRole('button',{name:'Añadir 2 objetos',exact:true}).click()
 await expect(sp.getByRole('dialog').getByRole('alert')).toBeVisible()
 const info=await sp.evaluate(()=>{const a=document.querySelector('[role=dialog] [role=alert]');let s=a.parentElement;const chain=[];while(s){const cs=getComputedStyle(s);if(/(auto|scroll)/.test(cs.overflowY))chain.push({cls:s.className.slice(0,60),sh:s.scrollHeight,ch:s.clientHeight,st:s.scrollTop});s=s.parentElement}const d=getComputedStyle(document.querySelector('.pick-dock'));return{chain,dockPos:d.position,dockBottom:d.bottom,text:a.textContent}})
 await sp.mouse.move(195,400);await sp.mouse.wheel(0,2000);await sp.waitForTimeout(300)
 const after=await sp.evaluate(()=>{const a=document.querySelector('[role=dialog] [role=alert]').getBoundingClientRect();const t=document.elementFromPoint(a.x+a.width/2,a.y+a.height/2);return{top:a.top,bottom:a.bottom,hit:!!t?.closest('[role=alert]')}})
 await sp.screenshot({path:`${dir}/round3-390-150-partial-error-wheel.png`})
 console.log(JSON.stringify({info,after},null,2))
}finally{await b.close()}
