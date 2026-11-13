import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { identityFixture } from './fixtures/identity.ts'
import { capture, expectTouchTargets } from './fixtures/audit.ts'
import { homebrewPackId, libraryServer } from './fixtures/library.ts'

// RYT-093: the content library manager. Editors upload the bundled SRD, edit entries as drafts
// and publish versions; everyone else never sees it.
const phone = (name: string) => name.endsWith('mobile')

async function audit(page: Page, scope = '#main-content') {
  // Dialogs scale in: measure them once the transition ends.
  await page
    .locator(scope)
    .first()
    .evaluate((node) =>
      Promise.all(node.getAnimations({ subtree: true }).map((a) => a.finished.catch(() => null))),
    )
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await expectTouchTargets(page.locator(scope).first(), 'button:visible, a:visible')
  const axe = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .include(scope)
    .analyze()
  expect(axe.violations).toEqual([])
}

test('an editor uploads the bundled SRD 5.2.1, publishes version 1 and opens a creature', async ({
  page,
}, info) => {
  test.setTimeout(90_000)
  await identityFixture(page)
  const server = libraryServer()
  await server.install(page)
  await page.goto('./')
  await page.getByRole('button', { name: /Perfil/ }).click()
  await page.getByRole('menuitem', { name: 'Biblioteca de contenido' }).click()
  await expect(
    page.getByRole('heading', { level: 1, name: 'Biblioteca de contenido' }),
  ).toBeVisible()
  await expect(page).toHaveTitle('Biblioteca de contenido · Rytta')
  await expect(page.getByText('Aún no hay paquetes')).toBeVisible()
  await audit(page)

  // The empty state offers both ways to start; the dialog opens on Cancel.
  await page.getByRole('button', { name: 'Subir el SRD 5.2.1' }).click()
  const upload = page.getByRole('dialog', { name: 'Subir el SRD 5.2.1' })
  await expect(upload.locator('button', { hasText: 'Cancelar' })).toBeFocused()
  await expect(
    upload.getByText(/con 1161 entradas: criaturas, sus rasgos y todo el glosario/),
  ).toBeVisible()
  await audit(page, '[role="dialog"]')
  await upload.getByRole('button', { name: 'Subir 1161 entradas' }).click()
  await expect(upload).toHaveCount(0, { timeout: 30_000 })
  await expect(page.getByRole('status').filter({ hasText: 'Subido como borrador.' })).toBeVisible()
  expect(server.packs).toHaveLength(1)
  expect(server.packs[0]).toMatchObject({
    slug: 'srd-5-2-1',
    visibility: 'public',
    license: 'CC-BY-4.0',
  })
  expect(server.entries()).toHaveLength(1161)
  await expect(page.locator('#lib-entries-title')).toBeFocused()

  // The SRD opens on its creatures, sorted by their Spanish names.
  await expect(
    page.getByRole('heading', { level: 2, name: 'Documento de referencia del sistema 5.2.1' }),
  ).toBeVisible()
  const names = await page.locator('.lib-entry-list .lib-row-name').allTextContents()
  expect(names.length).toBeGreaterThan(300)
  expect(names).toEqual([...names].sort(new Intl.Collator('es').compare))

  // Publishing sends every draft as version 1.
  await expect(page.locator('.lib-banner')).toContainText('1161 cambios sin publicar')
  await page.getByRole('button', { name: 'Publicar versión 1' }).click()
  const publish = page.getByRole('dialog', { name: /Publicar la versión 1/ })
  await expect(publish.locator('button', { hasText: 'Cancelar' })).toBeFocused()
  // The fixture lists every change; the hosted list stops at 1000 (the pack count is shown then).
  await expect(publish.getByText('1161 cambios sin publicar')).toBeVisible()
  await expect(publish.getByText('y 1149 más')).toBeVisible()
  await audit(page, '[role="dialog"]')
  await publish.getByRole('button', { name: 'Publicar', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Versión 1 publicada.' })).toBeVisible()
  expect(server.packs[0]!.version).toBe(1)
  await expect(page.getByText(/cambios sin publicar/)).toHaveCount(0)
  // The banner that opened the dialog is gone: focus lands on the pack.
  await expect(page.locator('#lib-entries-title')).toBeFocused()

  if (phone(info.project.name)) {
    // Coming back from an entry keeps the list position and focuses the entry just left.
    const row = page.locator('.lib-entry-list a').nth(40)
    await row.scrollIntoViewIfNeeded()
    const scrolled = await page.evaluate(() => window.scrollY)
    expect(scrolled).toBeGreaterThan(1000)
    await row.click()
    await expect(page.locator('#lib-entry-title')).toBeFocused()
    await page.getByRole('link', { name: 'Documento de referencia del sistema 5.2.1' }).click()
    await expect(row).toBeFocused()
    expect(Math.abs((await page.evaluate(() => window.scrollY)) - scrolled)).toBeLessThan(4)
  }

  // Search ignores accents and puts the exact name first.
  const firstRow = page.locator('.lib-entry-list .lib-row-name').first()
  await page.getByRole('searchbox').fill('dragon rojo')
  await expect(firstRow).toContainText('Dragón rojo')
  await page.getByRole('searchbox').fill('lobo')
  await expect(firstRow).toHaveText('Lobo')

  // The wolf's numbers and stat blocks come from the bundled bestiary.
  await page.getByRole('link', { name: /^Lobo VD 1\/4 · Bestia/ }).click()
  await expect(page.getByRole('heading', { level: 2, name: 'Lobo' })).toBeFocused()
  // The notice belonged to the pack screen.
  await expect(page.getByText('Versión 1 publicada.')).toHaveCount(0)
  await expect(page.getByRole('textbox', { name: 'Nombre (inglés)' })).toHaveValue('Wolf')
  await expect(page.getByText(/^VD 1\/4 · Bestia · CA \d+ · PG \d+$/)).toBeVisible()
  await expect(page.getByText(/^Lobo · Bestia Mediana/)).toBeVisible()
  await expect(page.getByText(/^Wolf · Medium Beast/)).toBeVisible()

  // The stat block editor edits library data: no campaign side or private notes.
  const editBlock = page.locator('.lib-blocks').getByRole('button', { name: 'Editar' }).first()
  await editBlock.click()
  const blockEditor = page.getByRole('dialog', { name: /^Lobo · / })
  await expect(blockEditor).toBeVisible()
  await expect(blockEditor.getByText('Bando', { exact: true })).toHaveCount(0)
  await expect(blockEditor.getByText('Notas privadas')).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(blockEditor).toHaveCount(0)
  await expect(editBlock).toBeFocused()

  // A failed save shows inside the stat block editor; the next attempt stores it and closes.
  await editBlock.click()
  await blockEditor.getByRole('textbox', { name: 'Nombre', exact: true }).first().fill('Lobo gris')
  const failure = '**/rest/v1/rpc/save_content_entry'
  await page.route(failure, (route) => route.fulfill({ status: 500, body: '{}' }))
  await blockEditor.getByRole('button', { name: 'Guardar criatura' }).click()
  await expect(blockEditor.getByRole('alert')).toContainText('No se pudo contactar con el servidor')
  await expect(blockEditor.getByRole('button', { name: 'Guardar criatura' })).toBeFocused()
  // Discarding after the failure leaves the entry as it was: nothing waits to be saved.
  await page.keyboard.press('Escape')
  await page
    .getByRole('dialog', { name: '¿Descartar los cambios?' })
    .getByRole('button', {
      name: 'Descartar cambios',
    })
    .click()
  await expect(blockEditor).toHaveCount(0)
  await expect(page.getByText(/^Lobo · Bestia Mediana/)).toBeVisible()
  await expect(page.getByText('Cambios sin guardar')).toHaveCount(0)
  // The next attempt stores it and closes.
  await editBlock.click()
  await blockEditor.getByRole('textbox', { name: 'Nombre', exact: true }).first().fill('Lobo gris')
  await page.unroute(failure)
  await blockEditor.getByRole('button', { name: 'Guardar criatura' }).click()
  await expect(blockEditor).toHaveCount(0)
  await expect(editBlock).toBeFocused()
  await expect(page.getByText(/^Lobo gris · Bestia Mediana/)).toBeVisible()

  // Another editor saves while a stat block is open on a clean form: the stat block editor stays
  // open and the form takes the new version, but the block never replaces that save silently.
  // It joins the form under the conflict banner, which can store it on top.
  const wolf = server.entries().find((e) => e.key === 'wolf')!
  const blockName = blockEditor.getByRole('textbox', { name: 'Nombre', exact: true }).first()
  await editBlock.click()
  await blockName.fill('Lobo pardo')
  Object.assign(wolf, { name_en: 'Grey wolf', revision: wolf.revision + 1 })
  await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')))
  await expect(page.getByRole('textbox', { name: 'Nombre (inglés)' })).toHaveValue('Grey wolf')
  await expect(blockEditor).toBeVisible()
  await blockEditor.getByRole('button', { name: 'Guardar criatura' }).click()
  await expect(blockEditor).toHaveCount(0)
  const keepMine = page.getByRole('button', { name: 'Guardar mis cambios encima' })
  await expect(keepMine).toBeFocused()
  expect((wolf.data.es as { name: string }).name).toBe('Lobo gris')
  await keepMine.click()
  await expect(page.getByRole('status').filter({ hasText: /^Guardado\.$/ })).toBeVisible()
  expect(wolf.name_en).toBe('Grey wolf')
  expect((wolf.data.es as { name: string }).name).toBe('Lobo pardo')

  // With edits of its own, a stat block refused as stale joins them under the conflict banner.
  await page.getByRole('textbox', { name: 'Nombre (inglés)' }).fill('Wolf')
  Object.assign(wolf, { name_es: 'Lobo ajeno', revision: wolf.revision + 1 })
  await editBlock.click()
  await blockName.fill('Lobo mío')
  await blockEditor.getByRole('button', { name: 'Guardar criatura' }).click()
  await expect(blockEditor).toHaveCount(0)
  await expect(keepMine).toBeFocused()
  await expect(page.getByRole('status').filter({ hasText: /^No se ha guardado/ })).toBeVisible()
  await keepMine.click()
  await expect(page.getByRole('status').filter({ hasText: /^Guardado\.$/ })).toBeVisible()
  expect(wolf.name_en).toBe('Wolf')
  expect((wolf.data.es as { name: string }).name).toBe('Lobo mío')

  if (phone(info.project.name)) {
    // One screen at a time: the editor replaces the list, and its back link returns to it.
    await expect(page.getByRole('searchbox')).toBeHidden()
    await page.getByRole('link', { name: 'Documento de referencia del sistema 5.2.1' }).click()
    await expect(page.getByRole('searchbox')).toBeVisible()
    // Each screen change focuses the screen that replaced the pressed link.
    await page.getByRole('link', { name: 'Paquetes', exact: true }).click()
    const packRow = page.locator('[data-pack]').first()
    await expect(packRow).toBeFocused()
    await packRow.click()
    await expect(page.locator('#lib-entries-title')).toBeFocused()
    await page.getByRole('link', { name: /^Lobo VD 1\/4/ }).click()
    await expect(page.getByRole('searchbox')).toBeHidden()
  } else await expect(page.getByRole('searchbox')).toBeVisible()
  await audit(page)
  await capture(page, `docs/evidence/RYT-093/creature-${info.project.name}.png`)
})

test('glossary entries change as drafts: text, JSON, leave guard, discard, delete and undo', async ({
  page,
}, info) => {
  await identityFixture(page)
  const server = libraryServer({ sample: true })
  await server.install(page)
  await page.goto(`./#/library/${homebrewPackId}/spell`)
  await page.getByRole('link', { name: /^Lanza de escarcha/ }).click()
  const name = page.getByRole('textbox', { name: 'Nombre (español)' })
  await expect(name).toHaveValue('Lanza de escarcha')
  const text = page.getByRole('textbox', { name: 'Texto (español)' })
  await expect(text).toHaveValue(
    'Lanzas un proyectil de hielo contra una criatura que veas.\n\n**Con un espacio de nivel superior.** El daño aumenta en 1d8.\n\n[[table:1]]',
  )
  await expect(
    page.getByText('Este texto tiene 1 tabla; edítala en la pestaña JSON.'),
  ).toBeVisible()
  const save = page.getByRole('button', { name: 'Guardar', exact: true })
  await name.fill('Lanza helada')
  await expect(page.getByText('Cambios sin guardar')).toBeVisible()
  await save.click()
  await expect(page.getByRole('status').filter({ hasText: /^Guardado\.$/ })).toBeVisible()
  // The button keeps keyboard focus after saving.
  await expect(save).toBeFocused()
  const entry = server.entries().find((e) => e.key === 'frost-lance')!
  expect(entry.name_es).toBe('Lanza helada')
  // The table survived the text form untouched.
  expect((entry.data.es as { blocks: unknown[] }).blocks).toHaveLength(3)
  // The state shows under the entry's name (the list beside it is hidden on phones).
  const meta = page.locator('.lib-entry-head')
  await expect(meta).toContainText('frost-lance · cambiada')
  if (!phone(info.project.name))
    await expect(page.getByRole('link', { name: /^Lanza helada.*cambiada/ })).toBeVisible()

  // JSON: an invalid edit is explained and the save is refused.
  await page.getByRole('tab', { name: 'JSON' }).click()
  const json = page.getByRole('textbox', { name: 'JSON' })
  await expect(json).toHaveValue(/"lv": 2/)
  await json.fill('{ "index": ')
  await expect(page.getByText(/^No es un JSON válido/)).toBeVisible()
  await expect(save).toHaveAttribute('aria-disabled', 'true')
  await json.fill('{ "index": { "lv": 3 } }')
  await expect(page.getByText(/^No es un JSON válido/)).toHaveCount(0)
  await page.getByRole('tab', { name: 'Formulario' }).click()
  await expect(page.getByRole('textbox', { name: 'Nivel' })).toHaveValue('3')

  // Leaving with unsaved changes asks first; keeping on editing keeps them.
  await page.getByRole('link', { name: 'Homebrew de la mesa' }).first().click()
  const leave = page.getByRole('dialog', { name: '¿Descartar los cambios sin guardar?' })
  await expect(leave.getByRole('button', { name: 'Seguir editando' })).toBeFocused()
  await audit(page, '[role="dialog"]')
  await leave.getByRole('button', { name: 'Seguir editando' }).click()
  await expect(leave).toHaveCount(0)
  await expect(page.getByRole('textbox', { name: 'Nivel' })).toHaveValue('3')
  if (!phone(info.project.name)) {
    // The open entry's own row has nothing to leave.
    await page.locator('.lib-entry-list .is-current').click()
    await expect(leave).toHaveCount(0)
  }

  // Browser back cannot be stopped: the edits wait for the entry and can be dropped there. Focus
  // moves to the row just left.
  await page.getByRole('textbox', { name: 'Nivel' }).focus()
  await page.goBack()
  await expect(page.locator('#lib-entry-title')).toHaveCount(0)
  const keptRow = page.getByRole('link', { name: /^Lanza helada.*sin guardar/ })
  await expect(keptRow).toBeVisible()
  await expect(keptRow).toBeFocused()
  await page.goForward()
  await expect(page.getByRole('textbox', { name: 'Nivel' })).toHaveValue('3')
  await expect(page.getByText('Cambios sin guardar recuperados.')).toBeVisible()
  await page.getByRole('button', { name: 'Descartarlos' }).click()
  await expect(page.getByRole('textbox', { name: 'Nivel' })).toHaveValue('2')
  await expect(page.getByText('Cambios sin guardar recuperados.')).toHaveCount(0)
  // The row's mark goes with them.
  await expect(page.getByRole('link', { name: /sin guardar/ })).toHaveCount(0)

  // Someone else saves first: these edits are refused instead of saved over it.
  const conflict = page.getByText('Esta entrada ha cambiado mientras editabas.')
  await name.fill('Lanza mía')
  const stored = server.entries().find((e) => e.key === 'frost-lance')!
  Object.assign(stored, { name_es: 'Lanza ajena', revision: stored.revision + 1 })
  await save.click()
  await expect(
    page.getByRole('status').filter({ hasText: /^No se ha guardado: la entrada cambió/ }),
  ).toBeVisible()
  await expect(conflict).toBeVisible()
  // The refused save leads to the banner's two ways out.
  await expect(page.getByRole('button', { name: 'Guardar mis cambios encima' })).toBeFocused()
  expect(stored.name_es).toBe('Lanza ajena')
  await page.getByRole('button', { name: 'Descartar mis cambios' }).click()
  await expect(name).toHaveValue('Lanza ajena')
  await expect(conflict).toHaveCount(0)

  // Edits kept from before another save come back with the conflict, and can be saved over it.
  await name.fill('Lanza mía')
  await page.goBack()
  Object.assign(stored, { name_es: 'Lanza de otra', revision: stored.revision + 1 })
  await page.goForward()
  await expect(conflict).toBeVisible()
  await expect(name).toHaveValue('Lanza mía')
  await page.getByRole('button', { name: 'Guardar mis cambios encima' }).click()
  await expect(page.getByRole('status').filter({ hasText: /^Guardado\.$/ })).toBeVisible()
  await expect(conflict).toHaveCount(0)
  await expect(page.locator('#lib-entry-title')).toBeFocused()
  expect(stored.name_es).toBe('Lanza mía')

  // Going back to the published entry asks first.
  await page.getByRole('button', { name: 'Volver a la publicada' }).click()
  const revert = page.getByRole('dialog', { name: /^¿Volver a la versión publicada/ })
  await expect(revert.locator('button', { hasText: 'Cancelar' })).toBeFocused()
  await revert.getByRole('button', { name: 'Volver a la publicada' }).click()
  await expect(page.getByRole('textbox', { name: 'Nombre (español)' })).toHaveValue(
    'Lanza de escarcha',
  )
  await expect(meta).not.toContainText('cambiada')

  // Deleting a published entry waits for the next version, and can be undone.
  await page.locator('.lib-entry-head').getByRole('button', { name: 'Borrar' }).click()
  const confirm = page.getByRole('dialog', { name: '¿Borrar «Lanza de escarcha»?' })
  await expect(confirm.getByText(/Los DMs la siguen viendo hasta que publiques/)).toBeVisible()
  await expect(confirm.locator('button', { hasText: 'Cancelar' })).toBeFocused()
  await confirm.getByRole('button', { name: 'Borrar' }).click()
  await expect(page.getByText('Se borra al publicar la próxima versión.')).toBeVisible()
  await expect(meta).not.toContainText('se borra al publicar')
  await expect(page.getByRole('button', { name: 'Borrar' })).toHaveCount(0)
  const undo = page.getByRole('button', { name: 'Deshacer borrado' })
  await expect(undo).toBeFocused()
  await expect(page.getByRole('textbox', { name: 'Nombre (español)' })).toBeDisabled()
  await undo.click()
  await expect(page.getByText('Se borra al publicar la próxima versión.')).toHaveCount(0)
  await expect(page.getByRole('textbox', { name: 'Nombre (español)' })).toBeEnabled()

  // Another editor's save reaches a clean form without taking focus from the field in use.
  const level = page.getByRole('textbox', { name: 'Nivel' })
  const latest = server.entries().find((e) => e.key === 'frost-lance')!
  await level.focus()
  Object.assign(latest, {
    data: { ...latest.data, index: { ...(latest.data.index as object), lv: 5 } },
    revision: latest.revision + 1,
  })
  await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')))
  await expect(level).toHaveValue('5')
  await expect(level).toBeFocused()

  // Another editor deletes the entry while it has edits here: its way back takes focus, and
  // undoing the delete keeps the edits under the conflict banner.
  await name.fill('Lanza conservada')
  Object.assign(latest, { deleted: true, revision: latest.revision + 1 })
  await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')))
  await expect(undo).toBeFocused()
  await undo.click()
  await expect(page.getByRole('button', { name: 'Guardar mis cambios encima' })).toBeFocused()
  await expect(name).toHaveValue('Lanza conservada')
  await page.getByRole('button', { name: 'Descartar mis cambios' }).click()
  await expect(name).toHaveValue('Lanza de escarcha')
  await audit(page)
  await capture(page, `docs/evidence/RYT-093/spell-${info.project.name}.png`)
})

test('a new subclass and a content file land as drafts after a report', async ({ page }, info) => {
  // In the light theme, where the refused count must keep its contrast.
  await page.addInitScript(() => localStorage.setItem('rytta-theme', 'parchment'))
  await identityFixture(page)
  const server = libraryServer({ sample: true })
  await server.install(page)
  await page.goto(`./#/library/${homebrewPackId}/subclass`)
  // Changing the kind keeps focus on its select.
  const kindSelect = page.getByRole('combobox', { name: 'Tipo' })
  await kindSelect.click()
  await page.getByRole('option', { name: /^Conjuros/ }).click()
  await expect(page).toHaveURL(/\/spell$/)
  await expect(kindSelect).toBeFocused()
  await kindSelect.click()
  await page.getByRole('option', { name: /^Subclases/ }).click()
  await expect(page).toHaveURL(/\/subclass$/)
  await page.getByRole('button', { name: 'Nueva entrada' }).click()
  await page.getByRole('textbox', { name: 'Nombre (español)' }).fill('Círculo de las Mareas')
  await page.getByRole('textbox', { name: 'Nombre (inglés)' }).fill('Circle of Tides')
  await expect(page.getByRole('textbox', { name: 'Clave' })).toHaveValue('circle-of-tides')
  await page
    .getByRole('textbox', { name: 'Texto (español)' })
    .fill('Primer párrafo.\n\n- Rasgo uno\n- Rasgo dos')
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  await expect(page.getByRole('heading', { level: 2, name: 'Círculo de las Mareas' })).toBeFocused()
  const created = server.entries().find((e) => e.key === 'circle-of-tides')!
  expect(created.data).toEqual({
    es: {
      blocks: [
        { t: 'p', x: 'Primer párrafo.' },
        { t: 'ul', items: ['Rasgo uno', 'Rasgo dos'] },
      ],
    },
  })

  // A Rytta content file: two entries go in, one is refused with its reason, and the report
  // after the check still names it.
  // On phones the pack's actions sit on the list screen.
  if (phone(info.project.name))
    await page.getByRole('link', { name: 'Homebrew de la mesa' }).click()
  const importButton = page.getByRole('button', { name: 'Importar' })
  await importButton.click()
  const dialog = page.getByRole('dialog', { name: 'Importar en Homebrew de la mesa' })
  await dialog.locator('input[type="file"]').setInputFiles({
    name: 'subclasses.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        format: 'rytta-content',
        version: 1,
        kind: 'subclass',
        entries: [
          { key: 'circle-of-ash', name_es: 'Círculo de la Ceniza', data: {} },
          {
            key: 'circle-of-embers',
            name_es: 'Círculo de las Brasas',
            name_en: 'Circle of Embers',
            data: { index: { class: 'druid' } },
          },
          { key: 'Bad Key', name_es: 'Mala', data: {} },
        ],
      }),
    ),
  })
  const refusal = 'Entrada 3 (Bad Key): Clave: minúsculas, números y guiones, 80 como mucho'
  await expect(dialog.getByText('2 entradas listas para revisar')).toBeVisible()
  await expect(dialog.getByText(refusal)).toBeVisible()
  await audit(page, '[role="dialog"]')
  await dialog.getByRole('button', { name: 'Revisar el archivo' }).click()
  await expect(dialog.getByText('Nuevas: 1 · Se actualizan: 1 · Sin cambios: 0')).toBeVisible()
  await expect(dialog.getByText(refusal)).toBeVisible()
  await expect(dialog.getByText('2 entradas listas para revisar')).toHaveCount(0)
  await audit(page, '[role="dialog"]')
  expect(server.entries().some((e) => e.key === 'circle-of-ash')).toBe(false)
  await dialog.getByRole('button', { name: 'Importar 2 entradas' }).click()
  await expect(
    page.getByRole('status').filter({ hasText: 'Importadas como borrador.' }),
  ).toBeVisible()
  expect(server.entries().find((e) => e.key === 'circle-of-ash')?.published).toBeNull()
  // Closing gives focus back to what opened the dialog.
  await expect(importButton).toBeFocused()
  await audit(page)
})

test('a new pack names itself, and a published pack keeps its identifier', async ({ page }) => {
  await identityFixture(page)
  const server = libraryServer({ sample: true })
  await server.install(page)
  await page.goto('./#/library')
  await page.getByRole('button', { name: 'Nuevo paquete' }).click()
  const dialog = page.getByRole('dialog', { name: 'Nuevo paquete' })
  await expect(dialog.getByRole('textbox', { name: 'Título (español)' })).toBeFocused()
  await dialog.getByRole('textbox', { name: 'Título (español)' }).fill('Mis criaturas')
  await expect(dialog.getByRole('textbox', { name: 'Identificador' })).toHaveValue('mis-criaturas')
  await expect(dialog.getByRole('radio', { name: /Privado/ })).toBeChecked()
  await audit(page, '[role="dialog"]')
  await dialog.getByRole('button', { name: 'Guardar' }).click()
  await expect(page.getByRole('heading', { level: 2, name: 'Mis criaturas' })).toBeVisible()
  expect(server.packs.find((p) => p.slug === 'mis-criaturas')).toMatchObject({
    visibility: 'private',
    version: 0,
  })
  // A new pack opens with focus on its heading. Asking to delete it moves focus to Cancel, and
  // Escape brings it back to the delete button.
  await expect(page.locator('#lib-entries-title')).toBeFocused()
  await page.getByRole('button', { name: 'Editar paquete' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Borrar paquete' }).click()
  await expect(page.getByRole('dialog', { name: '¿Borrar Mis criaturas?' })).toBeVisible()
  await expect(page.getByRole('dialog').locator('button', { hasText: 'Cancelar' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(
    page.getByRole('dialog').getByRole('button', { name: 'Borrar paquete' }),
  ).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)

  await page.goto(`./#/library/${homebrewPackId}/spell`)
  const editButton = page.getByRole('button', { name: 'Editar paquete' })
  await editButton.click()
  const edit = page.getByRole('dialog', { name: 'Editar Homebrew de la mesa' })
  await expect(edit.getByRole('textbox', { name: 'Identificador' })).toBeDisabled()
  await expect(edit.getByRole('button', { name: 'Borrar paquete' })).toHaveCount(0)
  // Escape closes it and gives focus back to the button that opened it.
  await page.keyboard.press('Escape')
  await expect(edit).toHaveCount(0)
  await expect(editButton).toBeFocused()
  await editButton.click()
  await edit.getByRole('radio', { name: /Público/ }).check()
  // A failed save keeps the dialog open and moves focus to its reason.
  const packFailure = '**/rest/v1/rpc/save_content_pack'
  await page.route(packFailure, (route) => route.fulfill({ status: 500, body: '{}' }))
  await edit.getByRole('button', { name: 'Guardar' }).click()
  await expect(edit.getByRole('alert')).toBeFocused()
  // A retry that fails again announces its reason again.
  await edit.getByRole('button', { name: 'Guardar' }).click()
  await expect(edit.getByRole('alert')).toBeFocused()
  await page.unroute(packFailure)
  await edit.getByRole('button', { name: 'Guardar' }).click()
  await expect(edit).toHaveCount(0)
  // Who can read a published pack changes through its own call, after the metadata.
  expect(server.calls.map((c) => c.method).filter((m) => m.includes('pack'))).toEqual(
    expect.arrayContaining(['save_content_pack', 'set_content_pack_visibility']),
  )
  expect(server.packs.find((p) => p.id === homebrewPackId)?.visibility).toBe('public')
})

test('accounts that are not editors see neither the menu item nor the library', async ({
  page,
}) => {
  await identityFixture(page)
  await libraryServer({ editor: false }).install(page)
  await page.goto('./')
  await page.getByRole('button', { name: /Perfil/ }).click()
  await expect(page.getByRole('menuitem', { name: 'Mis campañas' })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: 'Biblioteca de contenido' })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await page.goto('./#/library')
  await expect(page.getByRole('heading', { name: 'Solo para cuentas editoras' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Nuevo paquete' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Volver a mis campañas' })).toBeVisible()
  await audit(page)
})
