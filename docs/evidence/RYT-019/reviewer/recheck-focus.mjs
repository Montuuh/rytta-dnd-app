import { chromium, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { campaignId, identityFixture } from '../../../../tests/e2e/fixtures/identity.ts'
import { mkdirSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const out = 'docs/evidence/RYT-019/reviewer'
const captures = `${out}/focus-captures`
mkdirSync(captures, { recursive: true })
const digest = execFileSync(
  process.execPath,
  ['scripts/check-ui-review.mjs', '--fingerprint'],
  { encoding: 'utf8' },
).trim()
const base = 'http://127.0.0.1:4177/'
const browser = await chromium.launch()
const results = { sourceDigest: digest, matrix: [], failure: null }

try {
  for (const [width, lang, scheme] of [
    [390, 'es', 'dark'],
    [390, 'en', 'light'],
    [820, 'es', 'light'],
    [820, 'en', 'dark'],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height: 1000 },
      hasTouch: true,
      reducedMotion: 'reduce',
    })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.addInitScript(
      ({ lang, scheme }) => {
        localStorage.setItem('rytta-language', lang)
        localStorage.setItem('rytta-color-scheme', scheme)
      },
      { lang, scheme },
    )
    await identityFixture(page)
    await page.goto(`${base}#/campaign/${campaignId}/members`)
    await page.addStyleTag({ content: 'html {font-size:150%}' })

    const promoteLabel = lang === 'es' ? 'Nombrar DM' : 'Make DM'
    const cancelLabel = lang === 'es' ? 'Cancelar' : 'Cancel'
    const dialogTitle =
      lang === 'es' ? 'Confirmar cambio de miembros' : 'Confirm membership change'
    const trigger = page.getByRole('button', { name: promoteLabel, exact: true })
    await expect(trigger).toBeVisible()

    const box = await trigger.boundingBox()
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(44)
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44)

    await trigger.click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('heading', { name: dialogTitle, exact: true })).toBeVisible()
    await page.screenshot({
      path: `${captures}/promote-open-${width}-${lang}-${scheme}.png`,
      fullPage: true,
    })

    await page.keyboard.press('Escape')
    await expect(dialog).not.toBeVisible()
    await expect(trigger).toBeFocused()
    await page.screenshot({
      path: `${captures}/escape-restored-${width}-${lang}-${scheme}.png`,
      fullPage: true,
    })

    await page.keyboard.press('Enter')
    await expect(dialog).toBeVisible()

    // Footer Cancel shares accessible name with Modal close (aria-label=action.cancel).
    const cancelButton = dialog.getByRole('button', { name: cancelLabel, exact: true }).filter({
      hasText: cancelLabel,
    })
    await cancelButton.click()
    await expect(dialog).not.toBeVisible()
    await expect(trigger).toBeFocused()
    await page.screenshot({
      path: `${captures}/cancel-restored-${width}-${lang}-${scheme}.png`,
      fullPage: true,
    })

    await page.keyboard.press('Enter')
    await expect(dialog).toBeVisible()
    const axe = (
      await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
    ).violations
    expect(axe).toEqual([])
    await page.keyboard.press('Escape')
    await expect(trigger).toBeFocused()

    expect(errors).toEqual([])
    results.matrix.push({
      width,
      lang,
      scheme,
      promoteLabel,
      touch: { width: box?.width, height: box?.height },
      escapeRestoresFocus: true,
      enterReopens: true,
      cancelRestoresFocus: true,
      duplicateCancelAccessibleName: true,
      reducedMotion: 'reduce',
      textZoom: '150%',
      axe,
      errors,
    })
    await context.close()
  }

  const finalDigest = execFileSync(
    process.execPath,
    ['scripts/check-ui-review.mjs', '--fingerprint'],
    { encoding: 'utf8' },
  ).trim()
  expect(finalDigest).toBe(digest)
} catch (error) {
  results.failure = { message: error.message, stack: error.stack }
  process.exitCode = 1
} finally {
  writeFileSync(`${out}/focus-results.json`, JSON.stringify(results, null, 2) + '\n')
  await browser.close()
}
