import { chromium, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { identityFixture, campaignId, characterId } from '../../../../tests/e2e/fixtures/identity.ts'
import { mkdirSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const out = 'docs/evidence/RYT-020/reviewer'
mkdirSync(`${out}/captures`, { recursive: true })
const digest = execFileSync(process.execPath, ['scripts/check-ui-review.mjs', '--fingerprint'], {
  encoding: 'utf8',
}).trim()
const browser = await chromium.launch()
const results = { sourceDigest: digest, matrix: [], interaction: null, failure: null }
const base = 'http://127.0.0.1:4180/rytta-dnd-app/'

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
    [820, 'es', 'light'],
    [820, 'en', 'dark'],
  ]) {
    const es = language === 'es'
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
    await page.goto(`${base}#/campaign/${campaignId}/members`)
    const tag = `${width}-${language}-${scheme}`
    const row = { tag, captures: [], checks: [], errors }
    results.matrix.push(row)

    await expect(
      page.getByRole('heading', { name: es ? 'Tu mesa' : 'Your table', exact: true }),
    ).toBeVisible()
    const playerCard = page.locator('.mantine-Paper-root').filter({
      has: page.getByText('player@example.com', { exact: true }),
    })
    await expect(playerCard.getByText(es ? 'Personajes' : 'Characters', { exact: true })).toBeVisible()
    await expect(
      playerCard.getByText(es ? 'Sin personaje vinculado.' : 'No linked character.', { exact: true }),
    ).toBeVisible()
    await expect(
      page.getByRole('heading', {
        name: es ? 'Personajes sin jugador' : 'Unassigned characters',
        exact: true,
      }),
    ).toBeVisible()
    await expect(page.getByText('Arin', { exact: true }).first()).toBeVisible()
    await expect(page.getByText(es ? 'Oro' : 'Gold', { exact: true })).toHaveCount(0)

    const inviteBtn = page.getByRole('button', {
      name: es ? 'Invitar jugador' : 'Invite player',
      exact: true,
    })
    const linkBtn = playerCard.getByRole('button', {
      name: es ? 'Vincular personaje' : 'Link character',
      exact: true,
    })
    row.checks.push({
      inviteTarget: await minTarget(inviteBtn),
      linkTarget: await minTarget(linkBtn),
    })
    row.captures.push(await capture(page, `members-${tag}`))

    await inviteBtn.click()
    const inviteDialog = page.getByRole('dialog', {
      name: es ? 'Invitar jugador' : 'Invite player',
    })
    await expect(inviteDialog).toBeVisible()
    await expect(
      inviteDialog.getByText(es ? 'Sin personaje asignado' : 'No character assigned', {
        exact: true,
      }),
    ).toBeVisible()
    await expect(inviteDialog.getByLabel(es ? 'Correo de la cuenta de Google' : 'Google account email')).toBeVisible()
    row.captures.push(await capture(page, `invite-modal-${tag}`))
    await page.keyboard.press('Escape')
    await expect(inviteDialog).not.toBeVisible()
    await expect(inviteBtn).toBeFocused()

    await linkBtn.click()
    const linkDialog = page.getByRole('dialog', {
      name: es ? 'Vincular personaje' : 'Link character',
    })
    await expect(linkDialog).toBeVisible()
    row.captures.push(await capture(page, `link-modal-${tag}`))
    await page.keyboard.press('Escape')
    await expect(linkDialog).not.toBeVisible()
    await expect(linkBtn).toBeFocused()

    // Link character, then verify unlink control on the card.
    await linkBtn.click()
    await linkDialog.getByLabel(es ? 'Personaje' : 'Character', { exact: true }).selectOption(characterId)
    await linkDialog
      .getByRole('button', { name: es ? 'Vincular personaje' : 'Link character', exact: true })
      .click()
    await expect(playerCard.getByText('Arin', { exact: true })).toBeVisible()
    await expect(
      page.getByRole('heading', {
        name: es ? 'Personajes sin jugador' : 'Unassigned characters',
        exact: true,
      }),
    ).toHaveCount(0)
    const unlinkBtn = playerCard.getByRole('button', {
      name: es ? 'Desvincular jugador' : 'Unlink Player',
      exact: true,
    })
    row.checks.push({ unlinkTarget: await minTarget(unlinkBtn) })
    row.captures.push(await capture(page, `members-linked-${tag}`))

    await unlinkBtn.click()
    const unlinkDialog = page.getByRole('dialog', {
      name: es ? 'Desvincular jugador' : 'Unlink Player',
    })
    await expect(unlinkDialog).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(unlinkDialog).not.toBeVisible()
    await expect(unlinkBtn).toBeFocused()

    // Re-link for party preview checks on this matrix cell's first language pair only once below.
    await unlinkBtn.click()
    await page.getByRole('dialog').getByRole('button', { name: es ? 'Confirmar' : 'Confirm', exact: true }).click()
    await expect(
      playerCard.getByText(es ? 'Sin personaje vinculado.' : 'No linked character.', { exact: true }),
    ).toBeVisible()

    await page.goto(`${base}#/campaign/${campaignId}/party`)
    await expect(
      page.getByRole('button', { name: es ? 'Crear personaje' : 'Create character', exact: true }),
    ).toBeVisible()
    const playerView = page.getByRole('button', {
      name: es ? 'Vista Player' : 'Player view',
      exact: true,
    })
    row.checks.push({ playerViewTarget: await minTarget(playerView) })
    await playerView.click()
    await expect(page.getByRole('menuitem', { name: 'Arin', exact: true })).toBeVisible()
    row.captures.push(await capture(page, `player-view-menu-${tag}`))
    await page.getByRole('menuitem', { name: 'Arin', exact: true }).click()
    await expect(
      page.getByRole('button', { name: es ? 'Crear personaje' : 'Create character', exact: true }),
    ).toHaveCount(0)
    await expect(
      page.getByRole('button', { name: es ? 'Editar recursos' : 'Edit resources', exact: true }),
    ).toHaveCount(0)
    await expect(
      page.getByText(es ? 'Vista de Arin' : 'Arin view', { exact: true }),
    ).toBeVisible()
    await expect(
      page.getByText(
        es
          ? 'Tu DM todavía no te ha asignado un personaje.'
          : 'Your DM has not assigned a character to you yet.',
        { exact: true },
      ),
    ).toBeVisible()
    row.captures.push(await capture(page, `party-preview-empty-${tag}`))
    await page.getByRole('button', { name: es ? 'Volver a DM' : 'Return to DM', exact: true }).click()
    await expect(
      page.getByRole('button', { name: es ? 'Crear personaje' : 'Create character', exact: true }),
    ).toBeVisible()

    await page.addStyleTag({ content: 'html { font-size: 150%; }' })
    await page.goto(`${base}#/campaign/${campaignId}/members`)
    row.captures.push(await capture(page, `members-150-${tag}`))

    expect(errors).toEqual([])
    await context.close()
  }

  // Focused linked-POV check: assign first, then preview filters to that Player.
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
  const fixture = await identityFixture(page)
  await page.goto(`${base}#/campaign/${campaignId}/members`)
  const playerCard = page.locator('.mantine-Paper-root').filter({
    has: page.getByText('player@example.com', { exact: true }),
  })
  await playerCard.getByRole('button', { name: 'Vincular personaje', exact: true }).click()
  const linkDialog = page.getByRole('dialog', { name: 'Vincular personaje' })
  await linkDialog.getByLabel('Personaje', { exact: true }).selectOption(characterId)
  await linkDialog.getByRole('button', { name: 'Vincular personaje', exact: true }).click()
  await expect(playerCard.getByText('Arin', { exact: true })).toBeVisible()

  await page.goto(`${base}#/campaign/${campaignId}/party`)
  await expect(page.getByRole('heading', { name: 'Arin', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Editar recursos', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Vista Player', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Arin', exact: true }).click()
  await expect(page.getByText('Vista de Arin', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Arin', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Crear personaje', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Editar recursos', exact: true })).toHaveCount(0)
  results.interaction = {
    linkedPreviewShowsCharacter: true,
    dmActionsHidden: true,
    assignCalls: fixture.calls.filter((c) => c.method === 'assign_character').length,
    noMembershipMutations: fixture.calls.filter((c) => c.method === 'change_campaign_member').length === 0,
    captures: [
      await capture(page, 'party-preview-linked-390-es-dark'),
    ],
  }
  // Confirm REST characters requests used the player filter once preview was on.
  // Preview state is in-memory and resets on reload; re-enter after reload.
  const characterGets = []
  page.on('request', (request) => {
    if (request.url().includes('/rest/v1/characters')) characterGets.push(request.url())
  })
  await page.reload()
  await expect(page.getByRole('button', { name: 'Vista Player', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Vista Player', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Arin', exact: true }).click()
  await expect(page.getByText('Vista de Arin', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Editar recursos', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Actualizar', exact: true }).click()
  await expect
    .poll(() =>
      characterGets.some((url) =>
        url.includes('user_id=eq.10000000-0000-4000-8000-000000000002'),
      ),
    )
    .toBe(true)
  results.interaction.filteredRequest = characterGets.find((url) =>
    url.includes('user_id=eq.10000000-0000-4000-8000-000000000002'),
  )
  results.interaction.captures.push(await capture(page, 'party-preview-linked-refresh-390-es-dark'))

  // Hub membership-only invitation copy when the pending invite has no character.
  await page.route('**/rest/v1/rpc/list_my_invitations', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: '30000000-0000-4000-8000-000000000099',
          campaign_id: '20000000-0000-4000-8000-000000000003',
          campaign_name: 'The Amber Road',
          character_id: null,
          character_name: null,
          email: 'dm@example.com',
          expires_at: '2099-10-27T00:00:00Z',
        },
      ]),
    })
  })
  await page.goto(`${base}#/`)
  await expect(page.getByText('Sin personaje asignado', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'The Amber Road', exact: true })).toBeVisible()
  results.interaction.captures.push(await capture(page, 'hub-membership-copy-390-es-dark'))
  expect(errors).toEqual([])
  await context.close()

  const finalDigest = execFileSync(process.execPath, ['scripts/check-ui-review.mjs', '--fingerprint'], {
    encoding: 'utf8',
  }).trim()
  expect(finalDigest).toBe(digest)
} catch (error) {
  results.failure = { message: error.message, stack: error.stack }
  process.exitCode = 1
} finally {
  writeFileSync(`${out}/results.json`, JSON.stringify(results, null, 2) + '\n')
  await browser.close()
}
