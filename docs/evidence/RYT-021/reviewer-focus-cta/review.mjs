import { chromium, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { campaignId, identityFixture } from '../../../../tests/e2e/fixtures/identity.ts'
import { mkdirSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const out = 'docs/evidence/RYT-021/reviewer-focus-cta'
mkdirSync(`${out}/captures`, { recursive: true })

const digest = execFileSync(process.execPath, ['scripts/check-ui-review.mjs', '--fingerprint'], {
  encoding: 'utf8',
}).trim()

const base = 'http://127.0.0.1:4185/rytta-dnd-app/'
const removedToMembersEs = 'Ir a Miembros e invitaciones'
const removedToMembersEn = 'Go to Members & invitations'
const removedToPartyEs = 'Gestionar personajes en Grupo'
const removedToPartyEn = 'Manage characters in Party'
/** Former campaign.refreshing copy — must not reappear as background-fetch UI. */
const refreshingEs = 'Actualizando…'
const refreshingEn = 'Updating…'
/** common.loading — Party must not stick here for Players after boundary cache clear. */
const loadingEs = 'Abriendo tu compañero de aventuras…'
const loadingEn = 'Opening your companion…'

const browser = await chromium.launch()
const results = {
  sourceDigest: digest,
  preview: base,
  matrix: [],
  playerMatrix: [],
  interaction: null,
  failure: null,
}

async function capture(page, name) {
  const overflow = await page.evaluate(() => ({
    viewport: innerWidth,
    document: document.documentElement.scrollWidth,
  }))
  const axe = (
    await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
  ).violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    targets: v.nodes.map((n) => n.target),
  }))
  await page.screenshot({ path: `${out}/captures/${name}.png`, fullPage: true })
  expect(overflow.document, name).toBeLessThanOrEqual(overflow.viewport)
  expect(axe, name).toEqual([])
  return { name, overflow, axe }
}

async function minTarget(locator) {
  const box = await locator.boundingBox()
  expect(box, await locator.evaluate((el) => el.outerHTML.slice(0, 80))).toBeTruthy()
  expect(box.height).toBeGreaterThanOrEqual(44)
  expect(box.width).toBeGreaterThanOrEqual(44)
  return { width: box.width, height: box.height }
}

try {
  for (const [width, language, scheme] of [
    [390, 'es', 'dark'],
    [390, 'en', 'light'],
    [820, 'es', 'dark'],
    [820, 'en', 'light'],
  ]) {
    const es = language === 'es'
    const manageLabel = es ? removedToMembersEs : removedToMembersEn
    const partyCta = es ? removedToPartyEs : removedToPartyEn
    const createLabel = es ? 'Crear personaje' : 'Create character'
    const assignLabel = es ? 'Vincular jugador' : 'Link Player'
    const membersTitle = es ? 'Miembros e invitaciones' : 'Members & invitations'
    const refreshLabel = es ? 'Actualizar' : 'Refresh'
    const context = await browser.newContext({
      viewport: { width, height: 1000 },
      hasTouch: true,
      reducedMotion: 'reduce',
    })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.addInitScript(
      ({ language, scheme }) => {
        localStorage.setItem('rytta-language', language)
        localStorage.setItem('rytta-color-scheme', scheme)
      },
      { language, scheme },
    )
    await identityFixture(page)
    await page.goto(`${base}#/campaign/${campaignId}/party`)
    const tag = `${width}-${language}-${scheme}`
    const row = { tag, captures: [], checks: {}, errors }

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    const createBtn = page.getByRole('button', { name: createLabel, exact: true })
    await expect(createBtn).toBeVisible()
    row.checks.createTarget = await minTarget(createBtn)

    // Party page must not expose the removed Members CTA (page-level link/button).
    await expect(page.getByRole('link', { name: manageLabel, exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: manageLabel, exact: true })).toHaveCount(0)
    // Visible page body (outside dialogs) must not show that label either.
    await expect(page.locator('body')).not.toContainText(manageLabel)
    row.checks.removedCtaAbsentOnParty = true

    // Silent background refetch: Refresh stays available; isFetching must not drive visible loading UI.
    const refreshBtn = page.getByRole('button', { name: refreshLabel, exact: true })
    await expect(refreshBtn).toBeVisible()
    row.checks.refreshTarget = await minTarget(refreshBtn)
    await expect(page.locator('body')).not.toContainText(refreshingEs)
    await expect(page.locator('body')).not.toContainText(refreshingEn)
    await page.waitForTimeout(3000)
    await expect(page.locator('body')).not.toContainText(refreshingEs)
    await expect(page.locator('body')).not.toContainText(refreshingEn)
    await expect(refreshBtn).not.toHaveAttribute('aria-busy', 'true')
    await expect(refreshBtn).not.toHaveAttribute('data-loading', 'true')
    // Sample a short window for transient loading attrs from background fetch.
    const busySamples = []
    for (let i = 0; i < 6; i++) {
      busySamples.push(
        await refreshBtn.evaluate((el) => ({
          ariaBusy: el.getAttribute('aria-busy'),
          dataLoading: el.getAttribute('data-loading'),
        })),
      )
      await page.waitForTimeout(250)
    }
    expect(
      busySamples.every((s) => s.ariaBusy !== 'true' && s.dataLoading !== 'true'),
      'Refresh must not enter loading state from background fetch',
    ).toBe(true)
    row.checks.silentBackgroundRefetch = {
      refreshPresent: true,
      refreshingCopyAbsent: true,
      refreshNotBusyAfterWait: true,
      busySamples,
    }

    row.captures.push(await capture(page, `party-${tag}`))

    const linkBtn = page.getByRole('button', { name: assignLabel, exact: true }).first()
    await expect(linkBtn).toBeVisible()
    row.checks.linkTarget = await minTarget(linkBtn)
    await linkBtn.click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    const manageInDialog = dialog.getByRole('link', { name: manageLabel, exact: true })
    await expect(manageInDialog).toBeVisible()
    row.checks.manageMembersInDialog = true
    row.checks.manageLinkTarget = await minTarget(manageInDialog)
    row.captures.push(await capture(page, `link-dialog-${tag}`))

    await page.keyboard.press('Escape')
    await expect(dialog).not.toBeVisible()
    await expect(linkBtn).toBeFocused()

    await page.goto(`${base}#/campaign/${campaignId}/members`)
    await expect(page.getByRole('heading', { level: 1, name: membersTitle })).toBeVisible()
    await expect(page.getByRole('link', { name: partyCta, exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: partyCta, exact: true })).toHaveCount(0)
    await expect(page.locator('main')).not.toContainText(partyCta)
    row.checks.removedCtaAbsentOnMembers = true
    const membersRefresh = page.getByRole('button', { name: refreshLabel, exact: true })
    await expect(membersRefresh).toBeVisible()
    await expect(page.locator('body')).not.toContainText(refreshingEs)
    await expect(page.locator('body')).not.toContainText(refreshingEn)
    await expect(membersRefresh).not.toHaveAttribute('aria-busy', 'true')
    await expect(membersRefresh).not.toHaveAttribute('data-loading', 'true')
    row.checks.membersRefreshSilent = true
    row.captures.push(await capture(page, `members-${tag}`))

    expect(errors).toEqual([])
    results.matrix.push(row)
    await context.close()
  }

  // Player POV: CampaignBoundary must keep characters cache; Party must leave common.loading
  // and show the "Tu personaje" / "Your character" badge without Create/Edit DM actions.
  for (const [width, language, scheme] of [
    [390, 'es', 'dark'],
    [390, 'en', 'light'],
    [820, 'es', 'dark'],
    [820, 'en', 'light'],
  ]) {
    const es = language === 'es'
    const youBadge = es ? 'Tu personaje' : 'Your character'
    const createLabel = es ? 'Crear personaje' : 'Create character'
    const editLabel = es ? 'Editar recursos' : 'Edit resources'
    const loadingCopy = es ? loadingEs : loadingEn
    const context = await browser.newContext({
      viewport: { width, height: 1000 },
      hasTouch: true,
      reducedMotion: 'reduce',
    })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.addInitScript(
      ({ language, scheme }) => {
        localStorage.setItem('rytta-language', language)
        localStorage.setItem('rytta-color-scheme', scheme)
      },
      { language, scheme },
    )
    await identityFixture(page, { player: true })
    await page.goto(`${base}#/campaign/${campaignId}/party`)
    const tag = `player-${width}-${language}-${scheme}`
    const row = { tag, captures: [], checks: {}, errors }

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    // Must resolve past pending — not stuck on common.loading from cancelled characters query.
    await expect(page.getByText(youBadge, { exact: true })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText(loadingCopy, { exact: true })).toHaveCount(0)
    await expect(page.getByRole('status').filter({ hasText: loadingCopy })).toHaveCount(0)
    await expect(page.getByRole('button', { name: createLabel, exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: editLabel, exact: true })).toHaveCount(0)
    row.checks.playerYouBadge = true
    row.checks.notStuckOnLoading = true
    row.checks.createAbsent = true
    row.checks.editAbsent = true
    row.captures.push(await capture(page, `party-${tag}`))
    expect(errors).toEqual([])
    results.playerMatrix.push(row)
    await context.close()
  }

  // Separate no-players path: clear members via fixture-compatible route override after empty-ish members.
  // Default fixture includes a Player; verify dialog still surfaces manageMembers when eligible list is empty
  // by assigning the existing player first, then opening Link on a second character — instead use members
  // response rewrite for a dedicated check.
  {
    const context = await browser.newContext({
      viewport: { width: 390, height: 1000 },
      hasTouch: true,
      reducedMotion: 'reduce',
    })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.addInitScript(() => {
      localStorage.setItem('rytta-language', 'es')
      localStorage.setItem('rytta-color-scheme', 'dark')
    })
    await identityFixture(page)
    // Rewrite list_campaign_members to DM-only so Party shows noPlayers copy + manage link.
    await page.route('https://rytta-test.supabase.co/**', async (route) => {
      const url = new URL(route.request().url())
      const method = url.pathname.split('/').at(-1)
      if (method === 'list_campaign_members') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              user_id: '10000000-0000-4000-8000-000000000001',
              role: 'dm',
              email: 'dm@example.com',
              display_name: 'Table DM',
            },
          ]),
        })
      }
      return route.fallback()
    })
    await page.goto(`${base}#/campaign/${campaignId}/party`)
    const linkBtn = page.getByRole('button', { name: 'Vincular jugador', exact: true }).first()
    await expect(linkBtn).toBeVisible()
    await linkBtn.click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(
      dialog.getByText('Todavía no hay miembros con rol Player.', { exact: false }),
    ).toBeVisible()
    await expect(
      dialog.getByRole('link', { name: removedToMembersEs, exact: true }),
    ).toBeVisible()
    results.interaction = {
      noPlayersDialog: true,
      manageMembersVisible: true,
      capture: await capture(page, 'link-dialog-no-players-390-es-dark'),
      errors,
    }
    expect(errors).toEqual([])
    await context.close()
  }

  const finalDigest = execFileSync(
    process.execPath,
    ['scripts/check-ui-review.mjs', '--fingerprint'],
    { encoding: 'utf8' },
  ).trim()
  expect(finalDigest).toBe(digest)
  results.finalDigest = finalDigest
} catch (error) {
  results.failure = { message: error.message, stack: error.stack }
  process.exitCode = 1
} finally {
  writeFileSync(`${out}/results.json`, JSON.stringify(results, null, 2) + '\n')
  await browser.close()
}
