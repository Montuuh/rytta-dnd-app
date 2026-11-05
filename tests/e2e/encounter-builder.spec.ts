import { test, expect, type Page, type TestInfo } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { campaignId, identityFixture } from './fixtures/identity.ts'
import { capture, expectTouchTargets } from './fixtures/audit.ts'
import { combatServer } from './fixtures/combat.ts'

// RYT-054: the encounter builder in the DM console of a prepared fight (SRD 5.2.1 XP budget).
// The fixture party has two assigned level 5 characters: Low 1,000, Moderate 1,500, High 2,200 XP.
const size = (info: TestInfo) =>
  info.project.name === 'identity-mobile'
    ? 'mobile'
    : info.project.name === 'identity-tablet'
      ? 'tablet'
      : null
async function evidence(page: Page, info: TestInfo, name: string) {
  const s = size(info)
  if (s && process.env.RYT_EVIDENCE)
    await page.screenshot({ path: `docs/evidence/RYT-054/${name}-${s}.png` })
  await capture(page, info.outputPath(`${name}.png`))
}
async function audit(page: Page, scope = 'body') {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(
    (
      await new AxeBuilder({ page })
        .include(scope)
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()
    ).violations,
  ).toEqual([])
}
/** Numbers follow the interface language, with a no-break space before the unit. */
const xp = (n: number, language: 'es' | 'en' = 'es') => n.toLocaleString(language)
const unit = (n: number, language: 'es' | 'en' = 'es') =>
  `${xp(n, language)} ${language === 'es' ? 'PX' : 'XP'}`
const npc = (name: string, srd_id: string, extra: Record<string, unknown> = {}) => ({
  kind: 'npc',
  name,
  count: 1,
  max_hp: 50,
  armor_class: 12,
  initiative_bonus: 0,
  legendary_max: 0,
  side: 'enemy',
  hidden: false,
  share_initiative: false,
  srd_id,
  ...extra,
})

type Server = ReturnType<typeof combatServer>
async function prepare(page: Page, seed?: (server: Server, encounterId: string) => void) {
  const server = combatServer()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await identityFixture(page, { party: true, sheet: 'complete', modules: ['party', 'combat'] })
  await server.install(page)
  const created = server.act('create_encounter', {
    encounter_name: 'Cripta',
    request_id: 'crypt',
  }) as { encounter_id: string }
  seed?.(server, created.encounter_id)
  await page.goto(`./#/campaign/${campaignId}/combat/${created.encounter_id}`)
  await expect(page.getByRole('heading', { level: 1, name: 'Cripta' })).toBeVisible({
    timeout: 15_000,
  })
  return { server, encounterId: created.encounter_id }
}

test('RYT-054 the DM measures a prepared fight and fills it from suggestions', async ({
  page,
}, info) => {
  test.setTimeout(120_000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  const { server, encounterId } = await prepare(page)
  const card = page.getByRole('region', { name: 'Dificultad del encuentro' })
  await expect(card.getByRole('heading', { level: 2, name: 'Aún no hay enemigos' })).toBeVisible({
    timeout: 15_000,
  })
  // Before any character joins, everyone in play is the party.
  await expect(card).toContainText(
    `Presupuesto de este grupo: baja ${xp(1000)}, moderada ${xp(1500)}, alta ${unit(2200)}.`,
  )
  await expect(card).toContainText('Medido para 2 personajes, nivel medio 5.')
  await expect(card).toContainText('Cuentan todos los personajes en juego')

  // Suggestions aim at Moderate and spend what is left without going over.
  const open = card.getByRole('button', { name: 'Sugerir criaturas' })
  await open.click()
  const dialog = page.getByRole('dialog', { name: 'Sugerir criaturas para Cripta' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('radio', { name: /Moderada/ })).toBeChecked()
  await expect(dialog.getByText(`Quedan ${unit(1500)}`)).toBeVisible()
  // Escape closes the dialog and gives focus back to its opener.
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(open).toBeFocused()
  await open.click()
  await dialog.locator('label', { hasText: 'Un líder y su banda' }).click()
  const ideas = dialog.locator('.bld-idea')
  await expect(ideas.first()).toBeVisible()
  // One leader and its band: the first group is one creature, the second two or more.
  for (const title of await ideas.locator('.bld-idea-title').allTextContents())
    expect(title).toMatch(/^1 × .+ y \d+ × .+$/)
  await audit(page, '[role="dialog"]')
  await expectTouchTargets(dialog, 'button:visible, label.bst-tile')
  await evidence(page, info, 'suggest')
  // Another set is one tap away and is announced.
  await dialog.getByRole('button', { name: 'Otras ideas' }).click()
  await expect(dialog.getByRole('status')).toHaveText(/ideas? nuevas?|No hay más ideas nuevas/)
  await ideas
    .first()
    .getByRole('button', { name: /^Añadir 1 × .+ a Cripta$/ })
    .click()
  await expect(dialog).toHaveCount(0)
  await expect(open).toBeFocused()
  const added = server.encounters.find((e) => e.id === encounterId)!.combatants
  await expect.poll(() => added.length).toBeGreaterThan(2)
  expect(added.every((c) => c.srd_id && c.side === 'enemy' && !c.hidden)).toBe(true)
  expect(new Set(added.map((c) => c.srd_id)).size).toBe(2)
  await expect(card.getByRole('heading', { level: 2 })).toHaveText(/Dificultad (baja|moderada)/, {
    timeout: 15_000,
  })
  await expect(card.locator('.bld-notice')).toHaveText(/^Añadido a Cripta: 1 × /)
  // The dialog remembers the kind of build for the next idea.
  await open.click()
  await expect(dialog.getByRole('radio', { name: /Un líder y su banda/ })).toBeChecked()
  await page.keyboard.press('Escape')

  // The party joins: it is now the characters of the draft. A crowd of unrated bandits triggers
  // the SRD notes and is listed as not counted; the add notice leaves with that change.
  await page.getByRole('tab', { name: 'Añadir combatientes' }).click()
  await page.getByRole('button', { name: 'Añadir a todo el grupo' }).click()
  await expect(page.getByText('2 combatientes añadidos.')).toBeVisible()
  await expect(card.locator('.bld-notice')).toHaveCount(0)
  await page.getByRole('textbox', { name: 'Nombre', exact: true }).fill('Bandido')
  await page.getByLabel('Cuántas').fill('8')
  await page.getByRole('button', { name: 'Añadir criatura' }).click()
  await expect(card.getByRole('list', { name: 'Notas sobre este encuentro' })).toContainText(
    'Más de dos criaturas por personaje',
  )
  await expect(card).not.toContainText('Cuentan todos los personajes en juego')
  const details = card.getByRole('button', { name: 'Grupo y criaturas' })
  await details.click()
  await expect(details).toHaveAttribute('aria-expanded', 'true')
  await expect(card.getByText('8 × Bandido')).toBeVisible()
  await expect(card.getByText('Sin valor de desafío: sus PX no cuentan')).toBeVisible()
  await expect(card.getByText('Bardo, nivel 5').first()).toBeVisible()
  await audit(page)
  await expectTouchTargets(page, '.bld button:visible')
  await evidence(page, info, 'gauge')
  // Two creatures per character are already there: no more ideas are offered.
  await open.click()
  await expect(dialog.getByText(/ya tiene dos criaturas por personaje/)).toBeVisible()
  expect(errors).toEqual([])
})

test('RYT-054 the builder passes axe in English and the light theme', async ({ page }, info) => {
  test.setTimeout(90_000)
  await page.addInitScript(() => {
    localStorage.setItem('rytta-language', 'en')
    localStorage.setItem('rytta-color-scheme', 'light')
  })
  await prepare(page, (server, encounterId) =>
    server.act('add_combatants', {
      target_encounter: encounterId,
      entries: [npc('Ogre', 'ogre', { max_hp: 68, armor_class: 11 })],
      request_id: 'ogre',
    }),
  )
  const card = page.getByRole('region', { name: 'Encounter difficulty' })
  await expect(card.getByRole('heading', { level: 2, name: 'Low difficulty' })).toBeVisible({
    timeout: 15_000,
  })
  await expect(card).toContainText(`450 of ${unit(1000, 'en')}; 550 left.`)
  await card.getByRole('button', { name: 'Party and creatures' }).click()
  await expect(card.getByText(`CR 2, ${unit(450, 'en')}`)).toBeVisible()
  await audit(page)
  await evidence(page, info, 'gauge-en-light')
  await card.getByRole('button', { name: 'Suggest creatures' }).click()
  const dialog = page.getByRole('dialog', { name: 'Suggest creatures for Cripta' })
  // The draft's enemies are giants: ideas follow that type until the DM picks another.
  await expect(dialog.getByLabel('Creature type')).toHaveValue('Giant')
  await expect(dialog.locator('.bld-idea, .bld-empty').first()).toBeVisible()
  await audit(page, '[role="dialog"]')
})

test('RYT-054 a fight over the High budget pins the pointer and offers no ideas', async ({
  page,
}, info) => {
  test.setTimeout(90_000)
  await prepare(page, (server, encounterId) =>
    server.act('add_combatants', {
      target_encounter: encounterId,
      entries: [npc('Dragón rojo adulto', 'adult-red-dragon', { max_hp: 256 })],
      request_id: 'dragon',
    }),
  )
  const card = page.getByRole('region', { name: 'Dificultad del encuentro' })
  await expect(
    card.getByRole('heading', { level: 2, name: 'Por encima de la dificultad alta' }),
  ).toBeVisible({ timeout: 15_000 })
  await expect(card).toContainText(`${unit(18000)}, ${xp(15800)} por encima`)
  await expect(card.getByRole('button', { name: 'Sugerir criaturas' })).toHaveCount(0)
  await expect(card).toContainText('Este encuentro ya alcanza el presupuesto alto.')
  await expect(card.locator('.bld-gauge')).toHaveClass(/is-beyond/)
  // The notches keep the party's scale instead of bunching up at the start.
  const left = await card
    .locator('.bld-tick')
    .evaluateAll((ticks) => ticks.map((t) => parseFloat((t as HTMLElement).style.left)))
  expect(left.map((n) => Math.round(n))).toEqual([36, 55, 80])
  await audit(page)
  await evidence(page, info, 'over-high')
})

/** Pairs of boxes (by text) that overlap: words that run into each other or into the pointer. */
async function overlaps(page: Page, selector: string) {
  return page.locator(selector).evaluateAll((nodes) => {
    const boxes = nodes.map((n) => {
      const r = n.getBoundingClientRect()
      // The pointer's caret is a 6px pseudo-element above its hairline.
      const caret = n.classList.contains('bld-pointer') ? 6 : 0
      return {
        text: n.textContent || n.className,
        r: { left: r.left, right: r.right, top: r.top - caret, bottom: r.bottom },
      }
    })
    const hits: string[] = []
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]!.r
        const b = boxes[j]!.r
        const x = a.left < b.right - 0.5 && b.left < a.right - 0.5
        const y = a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5
        if (x && y) hits.push(`${boxes[i]!.text} × ${boxes[j]!.text}`)
      }
    return hits
  })
}

for (const scale of ['100%', '150%'])
  test(`RYT-054 at ${scale} text nothing overlaps: gauge words, pointer, rows and budget`, async ({
    page,
  }, info) => {
    test.skip(scale === '150%' && info.project.name === 'identity-desktop', 'Phone and tablet')
    test.setTimeout(90_000)
    // 1350 XP sits in the Moderate stretch, where the pointer passes under "Moderada".
    await prepare(page, (server, encounterId) =>
      server.act('add_combatants', {
        target_encounter: encounterId,
        entries: [npc('Ogro', 'ogre', { count: 3 })],
        request_id: 'ogres',
      }),
    )
    await page.addStyleTag({ content: `html { font-size: ${scale} }` })
    const card = page.getByRole('region', { name: 'Dificultad del encuentro' })
    await expect(card.getByRole('heading', { level: 2, name: 'Dificultad moderada' })).toBeVisible({
      timeout: 15_000,
    })
    expect(
      await overlaps(page, '.bld-gauge .bld-mark-word, .bld-gauge .bld-mark-xp, .bld-pointer'),
    ).toEqual([])
    await card.getByRole('button', { name: 'Grupo y criaturas' }).click()
    expect(await overlaps(page, '.bld-budget dd span, .bld-budget dd strong')).toEqual([])
    await card.getByRole('button', { name: 'Sugerir criaturas' }).click()
    const dialog = page.getByRole('dialog', { name: 'Sugerir criaturas para Cripta' })
    await expect(dialog.locator('.bld-idea, .bld-empty').first()).toBeVisible()
    expect(await overlaps(page, '.bld-target-word, .bld-target-xp')).toEqual([])
    const clipped = await dialog
      .locator('.bld-target, .bld-idea')
      .evaluateAll((nodes) =>
        nodes.filter((n) => n.scrollWidth > n.clientWidth + 1).map((n) => n.textContent),
      )
    expect(clipped).toEqual([])
    await audit(page, '[role="dialog"]')
    if (scale === '150%') await evidence(page, info, 'suggest-150')
  })

test('RYT-054 an add that spends the High budget exactly leaves focus on the reading', async ({
  page,
}) => {
  test.setTimeout(90_000)
  // 2000 XP against a High budget of 2200: every idea of any type adds exactly 200.
  await prepare(page, (server, encounterId) =>
    server.act('add_combatants', {
      target_encounter: encounterId,
      entries: [npc('Diablo barbado', 'barbed-devil'), npc('Oso pardo', 'brown-bear')],
      request_id: 'two',
    }),
  )
  const card = page.getByRole('region', { name: 'Dificultad del encuentro' })
  await card.getByRole('button', { name: 'Sugerir criaturas' }).click({ timeout: 15_000 })
  const dialog = page.getByRole('dialog', { name: 'Sugerir criaturas para Cripta' })
  await dialog.getByLabel('Tipo de criatura').click()
  await page.getByRole('option', { name: 'Cualquier tipo' }).click()
  const add = dialog
    .locator('.bld-idea')
    .first()
    .getByRole('button', { name: /^Añadir / })
  await add.focus()
  await page.keyboard.press('Enter')
  await expect(dialog).toHaveCount(0)
  const heading = card.getByRole('heading', { level: 2, name: 'Dificultad alta' })
  await expect(heading).toBeFocused()
  await expect(card).toContainText('El presupuesto alto está completo')
  await expect(card.getByRole('button', { name: 'Sugerir criaturas' })).toHaveCount(0)
})

test('RYT-054 enemies typed in without a challenge rating are named, not "no enemies"', async ({
  page,
}) => {
  test.setTimeout(90_000)
  await prepare(page, (server, encounterId) =>
    server.act('add_combatants', {
      target_encounter: encounterId,
      entries: [{ ...npc('Bandido', 'x', { count: 3 }), srd_id: undefined }],
      request_id: 'bandits',
    }),
  )
  const card = page.getByRole('region', { name: 'Dificultad del encuentro' })
  await expect(
    card.getByRole('heading', { level: 2, name: 'Enemigos sin valor de desafío' }),
  ).toBeVisible({ timeout: 15_000 })
})
