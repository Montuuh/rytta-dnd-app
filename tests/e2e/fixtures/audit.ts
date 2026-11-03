import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test'

/** Every control matched by `selector` inside `scope` (use `:visible`) meets the touch target.
 * One round trip instead of one per control; failures list every offending element's markup. */
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
