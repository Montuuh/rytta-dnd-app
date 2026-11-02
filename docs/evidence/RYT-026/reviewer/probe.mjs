import { chromium, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { writeFileSync } from 'node:fs'
import { identityFixture, campaignId, characterId } from '../../../../tests/e2e/fixtures/identity.ts'
import { shopsFixture } from '../../../../tests/e2e/fixtures/shops.ts'
const dir = 'docs/evidence/RYT-026/reviewer'
const base='http://127.0.0.1:4184/rytta-dnd-app/'
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAFElEQVR4nGM8UaHBgA0wYRUdtBIAHicBeAYWg8oAAAAASUVORK5CYII=','base64')
const results=[]
const browser=await chromium.launch()
async function audit(page,name){
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)
 const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()
 const small=[]
 for(const c of await page.locator('main button:visible,[role="dialog"] button:visible').all()){
  const b=await c.boundingBox();if(b&&(b.height<44||b.width<44))small.push({label:await c.getAttribute('aria-label')||await c.textContent(),...b})
 }
 await page.screenshot({path:`${dir}/${name}.png`,fullPage:true})
 results.push({name,overflow,axe:axe.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>n.target)})),small})
}
try{
 for(const scenario of [{width:390,height:844,language:'es',theme:'dark',zoom:false},{width:390,height:844,language:'en',theme:'light',zoom:true},{width:820,height:1180,language:'es',theme:'dark',zoom:true},{width:820,height:1180,language:'en',theme:'light',zoom:false}]){
  const context=await browser.newContext({viewport:{width:scenario.width,height:scenario.height},reducedMotion:'reduce',hasTouch:true})
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message))
  await page.addInitScript(({language,theme})=>{localStorage.setItem('rytta-language',language);localStorage.setItem('rytta-color-scheme',theme)},scenario)
  const f=await identityFixture(page,{noCharacters:true})
  const es=scenario.language==='es';const stem=`${scenario.width}-${scenario.language}-${scenario.theme}-${scenario.zoom?'150':'100'}`
  await page.goto(`${base}#/campaign/${campaignId}/items`)
  await expect(page.getByRole('heading',{level:1})).toHaveText(es?'Objetos de campaña':'Campaign items')
  if(scenario.zoom) await page.addStyleTag({content:'html{font-size:150%}'})
  await audit(page,`${stem}-empty`)
  const create=page.getByRole('button',{name:es?'Crear objeto':'Create item',exact:true})
  await create.focus();await page.keyboard.press('Enter')
  await page.getByRole('textbox',{name:es?'Nombre':'Name',exact:true}).fill('Piedra de luna — recuerdo de una campaña muy larga')
  await page.locator('input[type=file]').setInputFiles({name:'moon.png',mimeType:'image/png',buffer:png})
  await expect(page.getByRole('img',{name:es?'Vista previa de la imagen':'Image preview'})).toBeVisible()
  await audit(page,`${stem}-editor`)
  await page.getByRole('dialog').getByRole('button',{name:es?'Forjar objeto':'Forge item',exact:true}).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(create).toBeFocused()
  await audit(page,`${stem}-catalogue`)
  const edit=page.getByRole('button',{name:es?'Editar':'Edit',exact:true})
  await edit.click();await page.keyboard.press('Escape');await expect(edit).toBeFocused()
  const give=page.getByRole('button',{name:es?'Dar a personajes':'Give to characters',exact:true})
  await give.click();await audit(page,`${stem}-give-empty`);await page.keyboard.press('Escape');await expect(give).toBeFocused()
  results.push({name:stem,creationCount:f.inventory.definitions.length,stackCount:f.inventory.stacks.length,errors})
  await context.close()
 }
 const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,reducedMotion:'reduce'})
 const page=await context.newPage();const f=await identityFixture(page,{inventory:true,sheet:'complete',modules:['party','inventory','shops']});await shopsFixture(page,f)
 await page.goto(`${base}#/campaign/${campaignId}/items`)
 const card=page.locator('.mantine-Paper-root').filter({has:page.getByRole('heading',{name:'Armadura de cuero',exact:true})})
 await card.getByRole('button',{name:'Añadir a tienda'}).click()
 await page.getByRole('combobox',{name:'Tienda',exact:true}).click();await page.getByRole('option',{name:'Mercado del puerto',exact:true}).click()
 await audit(page,'390-shop-drawer');await page.keyboard.press('Escape');await expect(card.getByRole('button',{name:'Añadir a tienda'})).toBeFocused()
 await card.getByRole('button',{name:'Dar a personajes'}).click()
 await page.getByRole('combobox',{name:'Personaje',exact:true}).click();await page.getByRole('option',{name:'Arin',exact:true}).click()
 await audit(page,'390-give-drawer');await page.keyboard.press('Escape')
 await page.goto(`${base}#/campaign/${campaignId}/party`)
 const gold=page.getByRole('button',{name:/Editar oro de Arin/});await gold.click()
 await page.getByRole('textbox',{name:'Oro',exact:true}).fill('12345');await audit(page,'390-gold');await page.keyboard.press('Escape');await expect(gold).toBeFocused()
 await gold.click();await page.getByRole('textbox',{name:'Oro',exact:true}).fill('0');await page.keyboard.press('Enter');await expect(page.getByRole('dialog')).toHaveCount(0);await expect(gold).toBeFocused()
 await context.close()
 const player=await browser.newContext({viewport:{width:820,height:1180},hasTouch:true,reducedMotion:'reduce'})
 const pp=await player.newPage();await identityFixture(pp,{player:true,inventory:true,sheet:'complete'})
 await pp.goto(`${base}#/campaign/${campaignId}/party/${characterId}`);await pp.getByRole('link',{name:'Ver y cambiar equipo'}).click()
 await audit(pp,'820-player-equipment')
 await pp.getByRole('button',{name:'Quitar Armadura de cuero',exact:true}).click()
 await expect(pp.getByRole('img',{name:'Clase de Armadura 13'})).toBeVisible();await audit(pp,'820-player-unequipped')
 await player.close()
}catch(error){results.push({fatal:error.stack})}
finally{writeFileSync(`${dir}/browser-results.json`,JSON.stringify(results,null,2));await browser.close();console.log(JSON.stringify(results,null,2))}
