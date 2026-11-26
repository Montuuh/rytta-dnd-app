import { expect, test } from '@playwright/test'

/** RYT-186: routes are plain paths under the base; old `#/` addresses open the same route. */
const privacy = (page: import('@playwright/test').Page) =>
  page.getByRole('heading', { level: 1, name: /^(Política de privacidad|Privacy policy)$/ })

test('an old hash address opens the same route as a path', async ({ page }) => {
  const before = await page.evaluate(() => history.length)
  await page.goto('./#/privacy')
  await expect(page).toHaveURL(/\/rytta-dnd-app\/privacy$/)
  await expect(privacy(page)).toBeVisible()
  // Replaced in place: the visit adds one entry, as any page load does.
  expect(await page.evaluate(() => history.length)).toBe(before + 1)
  await page.goto('./?from=invite#/glossary?q=fuego')
  await expect(page).toHaveURL(/\/rytta-dnd-app\/glossary\?q=fuego&from=invite$/)
})

test('a deep path survives a reload and the back button', async ({ page }) => {
  await page.goto('./')
  await expect(page).toHaveURL(/\/rytta-dnd-app\/glossary$/)
  await page.goto('./privacy')
  await expect(privacy(page)).toBeVisible()
  await page.reload()
  await expect(page).toHaveURL(/\/rytta-dnd-app\/privacy$/)
  await expect(privacy(page)).toBeVisible()
  await page.goBack()
  await expect(page).toHaveURL(/\/rytta-dnd-app\/glossary$/)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
})
