import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test'

/** Every control matched by `selector` inside `scope` (use `:visible`) meets the touch target.
 * One round trip instead of one per control; failures list every offending element's markup.
 * An inline glossary term keeps the text flow, so its effective hit area is measured instead: its
 * box grown by the invisible `::after` (44px each way). */
export async function expectTouchTargets(
  scope: Page | Locator,
  selector: string,
  min: { height: number; width?: number } = { height: 44 },
) {
  const small = await scope
    .locator(selector)
    .evaluateAll((controls, min: { height: number; width?: number }) => {
      return controls
        .filter((control) => {
          const box = control.getBoundingClientRect()
          if (control.matches('.glossary-term')) {
            const after = getComputedStyle(control, '::after')
            const height = box.height - parseFloat(after.top) - parseFloat(after.bottom)
            const width = box.width - parseFloat(after.left) - parseFloat(after.right)
            return !(height >= min.height && width >= Math.max(min.height, min.width ?? 0))
          }
          return box.height < min.height || (min.width !== undefined && box.width < min.width)
        })
        .map((control) => control.outerHTML.slice(0, 300))
    }, min)
  expect(small, `controls smaller than ${JSON.stringify(min)}`).toEqual([])
}

/** Review screenshots under test-results/ are opt-in with RYT_CAPTURE=1: each full-page capture
 * costs a render, and passing runs never read them. Evidence for docs/ uses RYT_EVIDENCE. */
export async function capture(
  page: Page,
  path: string,
  options: Parameters<Page['screenshot']>[0] = {},
) {
  if (process.env.RYT_CAPTURE) await page.screenshot({ fullPage: true, ...options, path })
}

/** Language × scheme matrices run in full at 390px, where text at 150% is tightest; wider
 * viewports keep only the base combination (es, dark, default theme) to catch layout breaks. */
export function limitMatrix(info: TestInfo, base: boolean) {
  test.skip(!base && !info.project.name.endsWith('mobile'), 'Full matrix runs at 390px only')
}

/**
 * Lets `count` animation frames pass and says which control held focus at the end of each, as its
 * accessible label or text. For "focus stays where it is" and "nothing opens later" checks, so a
 * test waits for frames, never for a fixed time.
 */
export async function focusAcrossFrames(page: Page, count = 30): Promise<string[]> {
  return page.evaluate(async (frames) => {
    const seen: string[] = []
    for (let frame = 0; frame < frames; frame += 1) {
      await new Promise((done) => requestAnimationFrame(done))
      const active = document.activeElement as HTMLElement | null
      seen.push(
        active?.getAttribute('aria-label') ??
          `${active?.tagName ?? 'none'}:${(active?.textContent ?? '').trim().slice(0, 30)}`,
      )
    }
    return seen
  }, count)
}

/**
 * RYT-154: the picker's "Copy art prompt" puts a prompt for the entity on screen in the clipboard
 * and says so; the prompt ends with what never appears in a picture.
 */
export async function expectArtPrompt(scope: Page | Locator, page: Page, expected: RegExp) {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await scope
    .getByRole('button', { name: /^(Copiar prompt de arte|Copy art prompt)$/ })
    .first()
    .click()
  await expect(scope.getByText(/^(Prompt copiado|Prompt copied)/).first()).toBeVisible()
  const text = await page.evaluate(() => navigator.clipboard.readText())
  expect(text).toMatch(expected)
  expect(text).toMatch(/Not in the style of any named artist, studio, game or existing work\.$/)
}
