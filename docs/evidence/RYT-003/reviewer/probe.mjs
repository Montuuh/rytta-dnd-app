import { chromium } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { identityFixture, campaignId, characterId } from '../../../../tests/e2e/fixtures/identity.ts'
import { writeFileSync } from 'node:fs'
const out='docs/evidence/RYT-003/reviewer'
const browser=await chromium.launch()
const results=[]
const check=async(page,name)=>{
 const overflow=await page.evaluate(()=>({viewport:innerWidth,scroll:document.documentElement.scrollWidth}))
 const axe=(await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>n.target)}))
 const targets=await page.locator('button,a,input,select,[role="radio"]').evaluateAll(nodes=>nodes.filter(n=>n.getBoundingClientRect().width>0&&n.getBoundingClientRect().height>0&&getComputedStyle(n).visibility!=='hidden').map(n=>({text:n.getAttribute('aria-label')||n.textContent?.trim(),width:n.getBoundingClientRect().width,height:n.getBoundingClientRect().height})).filter(n=>n.width<44||n.height<44))
 results.push({name,overflow,axe,smallTargets:targets})
 await page.screenshot({path:`${out}/${name}.png`,fullPage:true})
}
for(const [width,lang,theme] of [[390,'es','dark'],[390,'en','light'],[820,'es','light'],[820,'en','dark']]) {
 const ctx=await browser.newContext({viewport:{width,height:1000},hasTouch:true,reducedMotion:'reduce'})
 const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message))
 await page.addInitScript(({lang,theme})=>{localStorage.setItem('rytta-language',lang);localStorage.setItem('rytta-color-scheme',theme)},{lang,theme})
 await identityFixture(page)
 await page.goto('http://127.0.0.1:4175/rytta-dnd-app/')
 await page.getByRole('heading',{name:'The Sunken Coast'}).waitFor()
 await check(page,`home-${width}-${lang}-${theme}`)
 await page.goto(`http://127.0.0.1:4175/rytta-dnd-app/#/campaign/${campaignId}/party`)
 await page.getByRole('heading',{name:'Arin',exact:true}).waitFor()
 await page.addStyleTag({content:'html{font-size:150%}'})
 await check(page,`party-${width}-${lang}-${theme}`)
 const edit=page.getByRole('button',{name:lang==='es'?'Editar recursos':'Edit resources'})
 await edit.click();await page.getByRole('dialog').waitFor()
 await check(page,`editor-${width}-${lang}-${theme}`)
 await page.keyboard.press('Tab');await page.keyboard.press('Shift+Tab');await page.keyboard.press('Escape')
 await page.getByRole('dialog').waitFor({state:'hidden'})
 results.push({name:`editor-focus-${width}`,focusReturned:await edit.evaluate(n=>document.activeElement===n)})
 const menu=page.getByRole('button',{name:lang==='es'?'Abrir menú de cuenta y ajustes':'Open account and settings menu'})
 await menu.click();await page.getByRole('dialog').waitFor()
 await check(page,`menu-${width}-${lang}-${theme}`)
 await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'})
 await page.waitForTimeout(250)
 results.push({name:`menu-focus-${width}`,focusReturned:await menu.evaluate(n=>document.activeElement===n)})
 await menu.click();await page.getByRole('dialog').getByRole('link',{name:/dm@example.com/}).click()
 await page.waitForTimeout(250)
 results.push({name:`home-navigation-${width}`,focus:await page.evaluate(()=>document.activeElement?.id),url:page.url(),errors})
 if(width===390&&lang==='es') {
  await page.route('**/rest/v1/characters?**',route=>route.fulfill({contentType:'application/json',body:JSON.stringify([{id:characterId,campaign_id:campaignId,user_id:null,name:'Long character name '.repeat(5).trim(),character_resources:{gold:9007199254740991,water_units:2147483647,rations:2147483647,exhaustion:2147483647,revision:0}}])}))
  await page.goto(`http://127.0.0.1:4175/rytta-dnd-app/#/campaign/${campaignId}/party`);await page.getByRole('heading',{name:/Long character/}).waitFor()
  await page.addStyleTag({content:'html{font-size:150%}'})
  await check(page,'max-resources-390-es-dark')
 }
 await ctx.close()
}
writeFileSync(`${out}/probe-results.json`,JSON.stringify(results,null,2))
await browser.close()
console.log(JSON.stringify(results))
