import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { campaignId, identityFixture } from './fixtures/identity.ts'
import { capture, expectTouchTargets, limitMatrix } from './fixtures/audit.ts'
import { lighthouseId, questServer } from './fixtures/quests.ts'

// RYT-006: the quest journal. Players read published quests by status, with a quiet mark on what
// changed since they last opened them; the DM writes, reveals objectives one by one and publishes.
const phone = (name: string) => name.endsWith('mobile')

async function audit(page: Page, scope = '#main-content') {
  await page
    .locator(scope)
    .first()
    .evaluate((node) =>
      Promise.all(node.getAnimations({ subtree: true }).map((a) => a.finished.catch(() => null))),
    )
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await expectTouchTargets(
    page.locator(scope).first(),
    'button:visible, a:visible, [role="checkbox"]:visible',
  )
  const axe = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .include(scope)
    .analyze()
  expect(axe.violations).toEqual([])
}

async function prefer(page: Page, language: string, theme: string) {
  await page.addInitScript(
    ({ language, theme }) => {
      localStorage.setItem('rytta-language', language)
      localStorage.setItem('rytta-theme', theme)
    },
    { language, theme },
  )
}

const journal = `./campaign/${campaignId}/quests`

for (const [language, theme] of [
  ['es', 'default'],
  ['en', 'default'],
  ['es', 'parchment'],
  ['en', 'parchment'],
] as const) {
  test(`RYT-006 a Player reads the journal by status and sees what changed (${language}, ${theme})`, async ({
    page,
  }, info) => {
    limitMatrix(info, language === 'es' && theme === 'default')
    const es = language === 'es'
    await prefer(page, language, theme)
    await identityFixture(page, { player: true, modules: ['party', 'quests'] })
    const server = questServer()
    await server.install(page)
    await page.goto(journal)
    const nav = page.getByRole('navigation', { name: es ? 'Misiones' : 'Quests' })
    await expect(nav.getByRole('heading', { name: es ? /Activas/ : /Active/ })).toBeVisible()
    await expect(nav.getByRole('heading', { name: es ? /Rumores/ : /Rumours/ })).toBeVisible()
    // Drafts never reach a Player.
    await expect(page.getByText('The cult’s new moon')).toHaveCount(0)
    // Closed quests fold away until asked for.
    const closed = nav.getByRole('button', {
      name: es ? 'Cumplidas y fallidas · 1' : 'Completed and failed · 1',
    })
    await expect(closed).toHaveAttribute('aria-expanded', 'false')
    const lighthouse = nav.getByRole('button', { name: /The dark lighthouse/ })
    await expect(lighthouse).toContainText(es ? 'Novedades' : 'Updated')
    await expect(lighthouse).toContainText(es ? '1 de 2' : '1 of 2')
    // The navigation carries the same news.
    await expect(
      page.getByRole('link', { name: es ? /Misiones · Novedades/ : /Quests · Updated/ }).first(),
    ).toBeVisible()
    await audit(page)
    await capture(page, info.outputPath(`quests-player-list-${language}-${theme}.png`))

    await lighthouse.click()
    const reader = page.getByRole('article', { name: 'The dark lighthouse' })
    await expect(reader).toBeVisible()
    await expect(reader.getByText('Climb to the lamp')).toBeVisible()
    await expect(reader.getByText(es ? 'nuevo' : 'new', { exact: true })).toHaveCount(1)
    await expect(reader.getByText('Break the spell')).toHaveCount(0)
    await expect(reader.getByText('cult spell')).toHaveCount(0)
    await expect
      .poll(() => server.calls.filter((c) => c.method === 'mark_quest_seen').length)
      .toBe(1)
    await audit(page, phone(info.project.name) ? '.mantine-Drawer-content' : '#main-content')
    await capture(page, info.outputPath(`quests-player-reader-${language}-${theme}.png`))
    if (phone(info.project.name)) {
      await page.keyboard.press('Escape')
      await expect(reader).toHaveCount(0)
    }
    await expect(lighthouse).not.toContainText(es ? 'Novedades' : 'Updated')
  })
}

test('RYT-006 a Player is told when the DM has not opened quests', async ({ page }) => {
  await identityFixture(page, { player: true, modules: ['party'] })
  await questServer().install(page)
  await page.goto(journal)
  await expect(page.getByText('El DM todavía no ha abierto las misiones.')).toBeVisible()
})

test('RYT-006 the DM writes a quest, reveals objectives and publishes it', async ({
  page,
}, info) => {
  await identityFixture(page, { modules: ['party', 'quests'] })
  const server = questServer({ dm: true })
  await server.install(page)
  await page.goto(journal)
  // The DM sees drafts in their section, marked as such.
  await expect(page.getByRole('button', { name: /The cult’s new moon.*Borrador/ })).toBeVisible()
  await page.getByRole('button', { name: 'Nueva misión' }).click()
  await expect(page.getByRole('form', { name: 'Nueva misión' })).toBeVisible()
  const editor = page.locator('form.quest-editor')
  await editor.getByLabel('Título').fill('The bell tower')
  await editor
    .getByLabel('Lo que ven los jugadores')
    .fill('The bell rings at midnight with no ringer.')
  await editor.getByRole('button', { name: 'Añadir objetivo' }).click()
  await editor.getByLabel('Objetivo 1').fill('Climb the tower')
  await editor.getByRole('button', { name: 'Revelar a los jugadores: Climb the tower' }).click()
  await expect(
    editor.getByRole('button', { name: 'Ocultar a los jugadores: Climb the tower' }),
  ).toHaveAttribute('aria-pressed', 'true')
  await editor.getByRole('button', { name: 'Añadir objetivo' }).click()
  await editor.getByLabel('Objetivo 2').fill('Find who rings it')
  await editor.getByLabel('Solo tú · DM').fill('A ghost of the old priest.')
  await audit(page, phone(info.project.name) ? '.mantine-Drawer-content' : '#main-content')
  await capture(page, info.outputPath('quests-dm-editor.png'))
  await editor.getByRole('button', { name: 'Publicar' }).click()
  await expect(page.getByText('Publicada: los jugadores ya la ven.')).toBeVisible()
  const saved = server.calls.find((c) => c.method === 'save_quest')!
  expect(saved.body).toMatchObject({
    expected_revision: null,
    payload: {
      title: 'The bell tower',
      published: true,
      note: 'A ghost of the old priest.',
      objectives: [
        { body: 'Climb the tower', visible: true, done: false },
        { body: 'Find who rings it', visible: false, done: false },
      ],
    },
  })
  // Advancing: tick an objective and save.
  await editor.getByRole('checkbox', { name: 'Cumplido: Climb the tower' }).check()
  await expect(editor.getByText('Cambios sin guardar')).toBeVisible()
  await editor.getByRole('button', { name: 'Guardar', exact: true }).click()
  await expect(page.getByText('Guardado.')).toBeVisible()
  expect(server.calls.filter((c) => c.method === 'save_quest').at(-1)!.body).toMatchObject({
    expected_revision: 1,
  })
  if (phone(info.project.name)) await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: /The bell tower/ })).toBeVisible()
})

test('RYT-006 the DM deletes a quest after confirming, and a stale save says why', async ({
  page,
}) => {
  await identityFixture(page, { modules: ['party', 'quests'] })
  const server = questServer({ dm: true, stale: true })
  await server.install(page)
  await page.goto(`${journal}?quest=${lighthouseId}`)
  const editor = page.getByRole('form', { name: 'The dark lighthouse' })
  await editor.getByLabel('Título').fill('The darker lighthouse')
  await editor.getByRole('button', { name: 'Guardar', exact: true }).click()
  await expect(editor.getByRole('alert')).toContainText('Otro dispositivo cambió esta misión')
  await editor.getByRole('button', { name: 'Borrar misión' }).click()
  const dialog = page.getByRole('dialog', { name: '¿Borrar «The dark lighthouse»?' })
  await dialog.getByRole('button', { name: 'Borrar', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  expect(server.quests().some((q) => q.id === lighthouseId)).toBe(false)
  await expect(page.getByRole('button', { name: /The dark lighthouse/ })).toHaveCount(0)
})

test('RYT-006 an empty journal says what to do', async ({ page }) => {
  await identityFixture(page, { modules: ['party', 'quests'] })
  await questServer({ dm: true, empty: true }).install(page)
  await page.goto(journal)
  await expect(page.getByText('Aún no hay misiones.', { exact: false })).toBeVisible()
  await audit(page)
})

test('RYT-006 the DM never loses unsaved changes by leaving, and Escape closes only the top layer', async ({
  page,
}, info) => {
  await identityFixture(page, { modules: ['party', 'quests'] })
  const server = questServer({ dm: true })
  await server.install(page)
  await page.goto(`${journal}?quest=${lighthouseId}`)
  const editor = page.locator('form.quest-editor')
  await editor.getByLabel('Título').fill('The darker lighthouse')
  // Escape in the delete dialog closes the dialog, not the editor.
  await editor.getByRole('button', { name: 'Borrar misión' }).click()
  const deleting = page.getByRole('dialog', { name: '¿Borrar «The dark lighthouse»?' })
  await expect(deleting).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(deleting).toHaveCount(0)
  await expect(editor.getByLabel('Título')).toHaveValue('The darker lighthouse')
  // Leaving with unsaved changes asks first; keeping them returns to the editor.
  if (phone(info.project.name)) await page.keyboard.press('Escape')
  else await page.getByRole('button', { name: /Brannoc’s debt/ }).click()
  const leaving = page.getByRole('dialog', { name: '¿Descartar los cambios sin guardar?' })
  await expect(leaving).toBeVisible()
  await leaving.getByRole('button', { name: 'Seguir editando' }).click()
  await expect(editor.getByLabel('Título')).toHaveValue('The darker lighthouse')
  if (phone(info.project.name)) await page.keyboard.press('Escape')
  else await page.getByRole('button', { name: /Brannoc’s debt/ }).click()
  await leaving.getByRole('button', { name: 'Descartar cambios' }).click()
  await expect(leaving).toHaveCount(0)
  // On a phone the sheet closes; on a tablet the other quest opens with its own title.
  if (phone(info.project.name)) await expect(editor).toHaveCount(0)
  else await expect(page.getByLabel('Título')).toHaveValue('Brannoc’s debt')
  expect(server.calls.some((c) => c.method === 'save_quest')).toBe(false)
})

test('RYT-006 leaving by navigation, Back or Escape asks before unsaved changes go', async ({
  page,
}, info) => {
  await identityFixture(page, { modules: ['party', 'quests'] })
  await questServer({ dm: true }).install(page)
  await page.goto(journal)
  await page.getByRole('button', { name: /The dark lighthouse/ }).click()
  const editor = page.locator('form.quest-editor')
  await editor.getByLabel('Título').fill('The darker lighthouse')
  const leaving = page.getByRole('dialog', { name: '¿Descartar los cambios sin guardar?' })
  const keep = async () => {
    await expect(leaving).toBeVisible()
    await leaving.getByRole('button', { name: 'Seguir editando' }).click()
    await expect(leaving).toHaveCount(0)
    await expect(editor.getByLabel('Título')).toHaveValue('The darker lighthouse')
  }
  if (phone(info.project.name)) {
    // A fresh sheet: Escape asks once; Back asks every time.
    await page.keyboard.press('Escape')
    await keep()
    await page.goBack()
    await keep()
    await page.goBack()
    await keep()
  }
  // Another destination in the navigation asks too (on a phone the sheet covers the bar).
  if (!phone(info.project.name)) {
    await page
      .getByRole('navigation', { name: 'Navegación principal' })
      .getByRole('link', { name: /Grupo/ })
      .first()
      .click()
    await keep()
  }
  await expect(page).toHaveURL(/\/quests/)
})

test('RYT-006 switching to the Player view and back keeps unsaved edits', async ({
  page,
}, info) => {
  test.skip(phone(info.project.name), 'The sheet covers the header switch on phones')
  await identityFixture(page, { modules: ['party', 'quests'] })
  await questServer({ dm: true }).install(page)
  await page.goto(`${journal}?quest=${lighthouseId}`)
  const editor = page.locator('form.quest-editor')
  await editor.getByLabel('Título').fill('The darker lighthouse')
  const preview = page.getByRole('switch', { name: /Vista jugador/ })
  await preview.click()
  await expect(page.getByRole('article', { name: 'The dark lighthouse' })).toBeVisible()
  await preview.click()
  await expect(editor.getByLabel('Título')).toHaveValue('The darker lighthouse')
  await expect(editor.getByText('Cambios sin guardar')).toBeVisible()
})
