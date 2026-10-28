import { chromium, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { identityFixture } from '../../../../tests/e2e/fixtures/identity.ts'
import { mkdirSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const out = 'docs/evidence/RYT-019/reviewer'
mkdirSync(`${out}/close-captures`, { recursive: true })
const digest = execFileSync(process.execPath,['scripts/check-ui-review.mjs','--fingerprint'],{encoding:'utf8'}).trim()
const browser = await chromium.launch()
const results = {sourceDigest:digest,matrix:[],failure:null}
try {
  for(const [width,lang,scheme] of [[390,'es','dark'],[390,'en','light'],[820,'es','light'],[820,'en','dark']]) {
    const context = await browser.newContext({viewport:{width,height:1000},hasTouch:true,reducedMotion:'reduce'})
    const page = await context.newPage()
    const errors=[]
    page.on('pageerror',error=>errors.push(error.message))
    await page.addInitScript(({lang,scheme})=>{
      localStorage.setItem('rytta-language',lang)
      localStorage.setItem('rytta-color-scheme',scheme)
    },{lang,scheme})
    await identityFixture(page)
    await page.goto('http://127.0.0.1:4175/rytta-dnd-app/')
    await page.addStyleTag({content:'html {font-size:150%}'})
    const trigger=page.getByRole('button',{name:lang==='es'?'Abrir menú de ajustes':'Open settings menu'})
    await trigger.click()
    await page.getByRole('menuitem',{name:lang==='es'?'Ajustes':'App setup',exact:true}).click()
    const dialog=page.getByRole('dialog')
    const close=dialog.getByRole('button',{name:lang==='es'?'Cerrar ajustes':'Close settings',exact:true})
    await expect(close).toBeVisible()
    await expect(dialog.getByRole('button',{name:lang==='es'?'Cerrar navegación':'Close navigation',exact:true})).toHaveCount(0)
    const size=await close.boundingBox()
    expect(size.width).toBeGreaterThanOrEqual(44)
    expect(size.height).toBeGreaterThanOrEqual(44)
    const axe=(await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations
    expect(axe).toEqual([])
    await page.screenshot({path:`${out}/close-captures/close-${width}-${lang}-${scheme}.png`,fullPage:true})
    await close.click()
    await expect(dialog).not.toBeVisible()
    await expect(trigger).toBeFocused()
    expect(errors).toEqual([])
    results.matrix.push({width,lang,scheme,size,axe,errors,closesAndReturnsFocus:true})
    await context.close()
  }
  const finalDigest=execFileSync(process.execPath,['scripts/check-ui-review.mjs','--fingerprint'],{encoding:'utf8'}).trim()
  expect(finalDigest).toBe(digest)
} catch(error) {
  results.failure={message:error.message,stack:error.stack}
  process.exitCode=1
} finally {
  writeFileSync(`${out}/close-results.json`,JSON.stringify(results,null,2)+'\n')
  await browser.close()
}
