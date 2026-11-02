import { test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { identityFixture, campaignId } from '../../../../tests/e2e/fixtures/identity.ts'
import { shopsFixture } from '../../../../tests/e2e/fixtures/shops.ts'

// CI fix check: slider end-mark labels at 150% text with Linux-like wide fallback fonts.
for (const scheme of ['dark', 'light'] as const)
  test(`sliders at 150% with wide fonts (${scheme})`, async ({ page }, info) => {
    const fixture = await identityFixture(page, { inventory: true })
    await shopsFixture(page, fixture)
    await page.addInitScript((scheme) => {
      localStorage.setItem('rytta-language', scheme === 'dark' ? 'es' : 'en')
      localStorage.setItem('rytta-color-scheme', scheme)
      document.addEventListener('DOMContentLoaded', () => {
        const s = document.createElement('style')
        s.textContent = 'html { font-size: 150% !important; } * { font-family: Verdana, "DejaVu Sans", sans-serif !important; }'
        document.head.appendChild(s)
      })
    }, scheme)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto(`./#/campaign/${campaignId}/shops`)
    await page.locator('[role="slider"]').first().waitFor()
    const r = await page.evaluate(() => {
      const w = innerWidth
      const sliders = [...document.querySelectorAll('.touch-slider')].map((root) => {
        const card = root.closest('.shop-controls, section') as HTMLElement
        const cb = card.getBoundingClientRect()
        const labels = [...root.querySelectorAll('.mantine-Slider-markLabel')].map((l) => l.getBoundingClientRect())
        const track = root.querySelector('.mantine-Slider-track')!.getBoundingClientRect()
        const thumb = root.querySelector('.mantine-Slider-thumb')!
        const tb = thumb.getBoundingClientRect()
        const before = getComputedStyle(thumb, '::before')
        const head = (card.querySelector('.mantine-Text-root, p') as HTMLElement | null)?.getBoundingClientRect()
        return {
          label: thumb.getAttribute('aria-label'),
          valuetext: thumb.getAttribute('aria-valuetext'),
          minLabelLeft: Math.round(Math.min(...labels.map((l) => l.left))),
          maxLabelRight: Math.round(Math.max(...labels.map((l) => l.right))),
          cardLeft: Math.round(cb.left), cardRight: Math.round(cb.right),
          trackLeft: Math.round(track.left), trackRight: Math.round(track.right),
          headingLeft: head ? Math.round(head.left) : null,
          thumb: [Math.round(tb.width), Math.round(tb.height)],
          hit: [Math.round(tb.width + 2 * Math.max(0, -parseFloat(before.left) || 0)), before.content],
        }
      })
      return { overflow: document.documentElement.scrollWidth - w, vw: w, sliders }
    })
    console.log(`[ci] ${info.project.name} ${scheme}: ${JSON.stringify(r)}`)
    const v = (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations
    console.log(`[ci] ${info.project.name} ${scheme} axe: ${JSON.stringify(v.map((x) => x.id))}`)
    // Keyboard still works and value text follows.
    const s = page.locator('[role="slider"]').last()
    await s.focus()
    await page.keyboard.press('ArrowRight')
    console.log(`[ci] ${info.project.name} ${scheme} after arrow: ${await s.getAttribute('aria-valuetext')}`)
    await page.locator('.shop-controls').screenshot({ path: info.outputPath(`controls-${scheme}.png`) })
    await page.locator('.touch-slider').last().locator('xpath=ancestor::section[1]').screenshot({ path: info.outputPath(`modifiers-${scheme}.png`) })
  })
