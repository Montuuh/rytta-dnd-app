# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: scaffold.spec.ts >> preview loads without a backend and routes survive a Pages reload
- Location: tests\e2e\scaffold.spec.ts:8:1

# Error details

```
Error: expect(received).toEqual(expected) // deep equality

- Expected  - 1
+ Received  + 4

- Array []
+ Array [
+   "http://127.0.0.1:4173/rytta-dnd-app/assets/supabase-pGbrMDOS.js",
+   "http://127.0.0.1:4173/rytta-dnd-app/assets/supabase-pGbrMDOS.js",
+ ]
```

# Page snapshot

```yaml
- generic [ref=f1e3]:
  - link "Skip to content" [ref=f1e4] [cursor=pointer]:
    - /url: "#main-content"
  - generic [ref=f1e5]:
    - banner [ref=f1e6]:
      - generic [ref=f1e7]:
        - button "Open account and settings menu" [ref=f1e8] [cursor=pointer]
        - paragraph [ref=f1e11]: The adventurer’s companion
      - generic [ref=f1e12]: Preview · sample data
    - main [ref=f1e15]:
      - generic [ref=f1e16]:
        - link "Back to camp" [ref=f1e17] [cursor=pointer]:
          - /url: "#/"
        - generic [ref=f1e23]:
          - paragraph [ref=f1e24]: YOUR ADVENTURE
          - heading "Party" [level=1] [ref=f1e25]
        - generic [ref=f1e27]:
          - generic [ref=f1e28]:
            - generic [ref=f1e29]: Planned module
            - paragraph [ref=f1e31]: RYT-003
          - heading "Character sheets and DM-managed resources." [level=2] [ref=f1e32]
          - paragraph [ref=f1e33]: This foundation establishes the navigation and module boundary. Gameplay and saved campaign data will be added in the corresponding backlog delivery.
    - contentinfo [ref=f1e34]: Made for the people around your table.
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test'
  2  | import AxeBuilder from '@axe-core/playwright'
  3  |
  4  | test.beforeEach(async ({ page }) => {
  5  |   await page.addInitScript(() => localStorage.setItem('rytta-language', 'en'))
  6  | })
  7  |
  8  | test('preview loads without a backend and routes survive a Pages reload', async ({
  9  |   page,
  10 | }, testInfo) => {
  11 |   const errors: string[] = []
  12 |   const requests: string[] = []
  13 |   page.on('pageerror', (error) => errors.push(error.message))
  14 |   page.on('request', (request) => {
  15 |     if (request.url().includes('supabase')) requests.push(request.url())
  16 |   })
  17 |   await page.goto('./')
  18 |   await expect(page.getByRole('heading', { name: /Every adventure starts/ })).toBeVisible()
  19 |   await expect(page.getByText('Preview · sample data')).toBeVisible()
  20 |   await page.screenshot({ path: testInfo.outputPath('camp.png'), fullPage: true })
  21 |   await page.getByRole('link', { name: 'Explore the party' }).click()
  22 |   await expect(page.getByRole('heading', { name: 'Party', exact: true })).toBeVisible()
  23 |   await page.reload()
  24 |   await expect(page.getByText('RYT-003')).toBeVisible()
  25 |   expect(errors).toEqual([])
> 26 |   expect(requests).toEqual([])
     |                    ^ Error: expect(received).toEqual(expected) // deep equality
  27 | })
  28 |
  29 | test('responsive layout and accessible overview', async ({ page }) => {
  30 |   await page.goto('./')
  31 |   await expect(page.getByRole('heading', { name: /Every adventure starts/ })).toBeVisible()
  32 |   expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
  33 |     true,
  34 |   )
  35 |   const result = await new AxeBuilder({ page })
  36 |     .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
  37 |     .analyze()
  38 |   expect(result.violations).toEqual([])
  39 | })
  40 |
  41 | test('mobile drawer supports Escape and returns focus', async ({ page }, testInfo) => {
  42 |   test.skip(testInfo.project.name !== 'mobile', 'Mobile drawer only')
  43 |   await page.goto('./')
  44 |   const menu = page.getByRole('button', { name: 'Open account and settings menu' })
  45 |   await menu.click()
  46 |   await expect(page.getByRole('dialog')).toBeVisible()
  47 |   await page.keyboard.press('Escape')
  48 |   await expect(page.getByRole('dialog')).not.toBeVisible()
  49 |   await expect(menu).toBeFocused()
  50 |   await page.keyboard.press('Enter')
  51 |   await page.getByRole('dialog').getByRole('link', { name: 'Inventory', exact: true }).click()
  52 |   await expect(page.getByRole('dialog')).not.toBeVisible()
  53 |   await expect(page.getByRole('heading', { name: 'Inventory', exact: true })).toBeVisible()
  54 | })
  55 |
  56 | test('large text and reduced motion retain usable navigation', async ({ page }) => {
  57 |   await page.emulateMedia({ reducedMotion: 'reduce' })
  58 |   await page.goto('./#/inventory')
  59 |   await page.addStyleTag({ content: 'html { font-size: 150%; }' })
  60 |   await expect(page.getByRole('heading', { name: 'Inventory', exact: true })).toBeVisible()
  61 |   expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
  62 |     true,
  63 |   )
  64 |   await page.getByRole('link', { name: 'Back to camp' }).click()
  65 |   await expect(page.getByRole('heading', { name: /Every adventure starts/ })).toBeVisible()
  66 | })
  67 |
```
