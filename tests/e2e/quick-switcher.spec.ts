import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { campaignId, identityFixture } from './fixtures/identity.ts'
import { combatServer } from './fixtures/combat.ts'
import { expectTouchTargets, placeholderRoom } from './fixtures/audit.ts'

// RYT-179: the DM's quick switcher (Ctrl+K, "/", the header control) and the deep-link actions
// (`?do=new`, `?do=loot`) that the pages consume once.
const home = `./campaign/${campaignId}`
const membersUrl = `${home}/members`
const base = `/campaign/${campaignId}`

async function dmPage(page: Page, options: Parameters<typeof identityFixture>[1] = {}) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await identityFixture(page, {
    party: true,
    inventory: true,
    sheet: 'complete',
    modules: ['party', 'combat'],
    ...options,
  })
}

const switcher = (page: Page) => page.getByRole('dialog', { name: 'Ir a' })
const field = (page: Page) => page.getByRole('combobox', { name: 'Buscar panel o acción' })
const trigger = (page: Page) =>
  page.locator('header').getByRole('button', { name: 'Buscar panel o acción' })
const route = (page: Page) => {
  const url = new URL(page.url())
  return url.pathname + url.search
}
/** The shortcut needs the campaign shell: wait for the header control, then press it. */
async function openByKeyboard(page: Page) {
  await expect(trigger(page)).toBeVisible()
  await page.keyboard.press('Control+k')
}

test('opens with Ctrl+K, with / outside fields and from the header control', async ({
  page,
}, info) => {
  await dmPage(page)
  await page.goto(home)
  const control = trigger(page)
  await expect(control).toBeVisible()
  const box = (await control.boundingBox())!
  expect(box.height).toBeGreaterThanOrEqual(44)
  expect(box.width).toBeGreaterThanOrEqual(44)
  await expect(control).toHaveAttribute('aria-haspopup', 'dialog')

  await openByKeyboard(page)
  await expect(switcher(page)).toBeVisible()
  await expect(field(page)).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(switcher(page)).toHaveCount(0)

  await page.locator('body').click({ position: { x: 2, y: 400 } })
  await page.keyboard.press('/')
  await expect(switcher(page)).toBeVisible()
  await expect(field(page)).toHaveValue('')
  await page.keyboard.press('Escape')
  await expect(switcher(page)).toHaveCount(0)

  await control.click()
  await expect(switcher(page)).toBeVisible()
  await expect(control).toHaveAttribute('aria-expanded', 'true')
  await page.keyboard.press('Escape')
  await expect(switcher(page)).toHaveCount(0)
  // Escape returns focus to the control that opened it.
  await expect(control).toBeFocused()
  expect(info.project.name).toBeTruthy()
})

test('Escape returns focus to the control that was focused, and Back closes it', async ({
  page,
}) => {
  await dmPage(page)
  await page.goto(membersUrl)
  const control = trigger(page)
  await control.focus()
  await openByKeyboard(page)
  await expect(switcher(page)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(switcher(page)).toHaveCount(0)
  await expect(control).toBeFocused()

  await openByKeyboard(page)
  await expect(switcher(page)).toBeVisible()
  await page.goBack()
  await expect(switcher(page)).toHaveCount(0)
  expect(route(page)).toContain('/members')
})

test('"/" does not open while typing in a field and the bestiary keeps it for its search', async ({
  page,
}) => {
  const server = combatServer()
  await dmPage(page)
  await server.install(page)
  await page.goto(`${membersUrl}?panel=items`)
  const search = page.getByRole('searchbox', { name: 'Buscar objetos' })
  await search.click()
  await page.keyboard.press('/')
  await expect(switcher(page)).toHaveCount(0)
  await expect(search).toHaveValue('/')
  // Ctrl+K is still available from a field.
  await openByKeyboard(page)
  await expect(switcher(page)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(search).toBeFocused()

  await page.goto(`${membersUrl}?panel=bestiary`)
  const finder = page.locator('#bestiary-search')
  await expect(finder).toBeVisible()
  await page.locator('body').click({ position: { x: 2, y: 400 } })
  await page.keyboard.press('/')
  await expect(finder).toBeFocused()
  await expect(switcher(page)).toHaveCount(0)
})

test('filters both groups ignoring case and accents, and announces the active option', async ({
  page,
}) => {
  await dmPage(page)
  await page.goto(home)
  await openByKeyboard(page)
  const input = field(page)
  const options = switcher(page).getByRole('option')
  await expect(switcher(page).getByRole('group', { name: 'Paneles' })).toBeVisible()
  await expect(switcher(page).getByRole('group', { name: 'Acciones' })).toBeVisible()
  await expect(options).toHaveCount(14)

  await input.fill('botin')
  await expect(options).toHaveCount(1)
  await expect(options.first()).toHaveText('Repartir botín')
  await expect(switcher(page).getByRole('group', { name: 'Acciones' })).toBeVisible()
  await expect(switcher(page).getByRole('group', { name: 'Paneles' })).toHaveCount(0)

  await input.fill('ALMACEN')
  await expect(options).toHaveText(['Almacén de objetos', 'Nuevo objeto'])
  await input.fill('nivel')
  await expect(options).toHaveText(['Nivel del grupo', 'Fijar nivel del grupo'])

  await input.fill('zzzz')
  await expect(options).toHaveCount(0)
  await expect(switcher(page).locator('.switcher-empty')).toContainText('Nada coincide con «zzzz»')
  await expect(input).toHaveAttribute('aria-expanded', 'false')
  await expect(input).not.toHaveAttribute('aria-activedescendant', /./)

  await input.fill('')
  await expect(options).toHaveCount(14)
  // The first option is active and named by aria-activedescendant.
  const activeId = async () => input.getAttribute('aria-activedescendant')
  const first = options.first()
  await expect(first).toHaveAttribute('aria-selected', 'true')
  expect(await activeId()).toBe(await first.getAttribute('id'))
  await page.keyboard.press('ArrowDown')
  await expect(options.nth(1)).toHaveAttribute('aria-selected', 'true')
  expect(await activeId()).toBe(await options.nth(1).getAttribute('id'))
  await page.keyboard.press('End')
  await expect(options.last()).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('ArrowDown')
  await expect(first).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('ArrowUp')
  await expect(options.last()).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('Home')
  await expect(first).toHaveAttribute('aria-selected', 'true')
  await expect(input).toBeFocused()
})

const destinations: [string, string, RegExp][] = [
  ['resumen', 'Resumen', new RegExp(`${base}$`)],
  ['bestiario', 'Bestiario', /\/members\?panel=bestiary$/],
  ['almacen', 'Almacén de objetos', /\/members\?panel=items$/],
  ['miembros', 'Miembros', /\/members$/],
  ['nivel del', 'Nivel del grupo', /\/members\?panel=level$/],
  ['modulos', 'Módulos activos', /\/members\?panel=modules$/],
  ['dados', 'Dados', /\/members\?panel=dice$/],
  ['contenido', 'Contenido', /\/members\?panel=content$/],
  ['auditoria', 'Auditoría', /\/members\?panel=audit$/],
  ['fijar nivel', 'Fijar nivel del grupo', /\/members\?panel=level$/],
]

test('Enter runs the active entry: the right address, the switcher closed', async ({ page }) => {
  await dmPage(page)
  await page.goto(`${home}/combat`)
  for (const [query, label, expected] of destinations) {
    await openByKeyboard(page)
    await field(page).fill(query)
    await expect(switcher(page).getByRole('option').first()).toHaveText(label)
    await page.keyboard.press('Enter')
    await expect(switcher(page)).toHaveCount(0)
    await expect.poll(() => page.url()).toMatch(expected)
    // Nothing is left focused on the body: the page or its dialog has it.
    await expect
      .poll(
        () =>
          page.evaluate(() => document.activeElement?.tagName + '#' + document.activeElement?.id),
        { message: label },
      )
      .not.toBe('BODY#')
  }
  // The links of actions that other pages consume end up on the right address (a tap works too).
  for (const [label, expected] of [
    // Members consumes `do=invite` at once: the address is left clean with the dialog open.
    ['Invitar jugador', /\/members$/],
    ['Nueva criatura', /\/members\?panel=bestiary(&do=new)?$/],
  ] as const) {
    await openByKeyboard(page)
    await switcher(page).getByRole('option', { name: label, exact: true }).click()
    await expect(switcher(page)).toHaveCount(0)
    await expect.poll(() => page.url()).toMatch(expected)
    if (label === 'Invitar jugador') {
      const invite = page.getByRole('dialog', { name: 'Invitar jugador' })
      await expect(invite).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(invite).toHaveCount(0)
    }
  }
})

test('a Player and the DM in Player view get no control and no shortcut', async ({ page }) => {
  await dmPage(page, { player: true })
  await page.goto(home)
  await expect(page.locator('.header-campaign-name')).toBeVisible()
  await expect(trigger(page)).toHaveCount(0)
  await page.keyboard.press('Control+k')
  await page.locator('body').click({ position: { x: 2, y: 400 } })
  await page.keyboard.press('/')
  await expect(switcher(page)).toHaveCount(0)
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('the DM in Player view loses the control and the shortcuts, and gets them back', async ({
  page,
}) => {
  await dmPage(page, { party: false, linkedPlayer: true })
  await page.goto(home)
  await expect(trigger(page)).toBeVisible()
  await page.getByRole('switch', { name: 'Vista jugador', exact: true }).click()
  await expect(page.getByText('Viendo como jugador · Arin')).toBeVisible()
  await expect(trigger(page)).toHaveCount(0)
  await page.locator('body').click({ position: { x: 2, y: 400 } })
  await page.keyboard.press('Control+k')
  await page.keyboard.press('/')
  await expect(switcher(page)).toHaveCount(0)
  await page.getByRole('switch', { name: 'Vista jugador', exact: true }).click()
  await expect(trigger(page)).toBeVisible()
  await openByKeyboard(page)
  await expect(switcher(page)).toBeVisible()
})

test('?do=new opens the item editor once and the parameter leaves the address', async ({
  page,
}) => {
  await dmPage(page)
  await page.goto(`${membersUrl}?panel=items&do=new`)
  const editor = page.getByRole('dialog')
  await expect(editor).toBeVisible()
  await expect(editor.getByRole('heading', { name: 'Forjar objeto' })).toBeVisible()
  await expect.poll(() => page.url()).not.toContain('do=')
  expect(route(page)).toContain('panel=items')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  // Reload and Back never repeat it.
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Almacén de objetos' })).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('?do=loot opens the loot distribution once', async ({ page }) => {
  await dmPage(page)
  await page.goto(`${membersUrl}?panel=items&do=loot`)
  const loot = page.getByRole('dialog')
  await expect(loot).toBeVisible()
  // With no line yet the loot view opens on the item picker.
  await expect(loot.getByRole('searchbox', { name: 'Buscar objeto para añadir' })).toBeVisible()
  await expect.poll(() => page.url()).not.toContain('do=')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Almacén de objetos' })).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('?do=new starts a new creature once', async ({ page }) => {
  const server = combatServer()
  await dmPage(page)
  await server.install(page)
  await page.goto(`${membersUrl}?panel=bestiary&do=new`)
  const start = page.getByRole('dialog')
  await expect(start).toBeVisible()
  await expect(start.getByRole('heading', { name: '¿Cómo quieres empezar?' })).toBeVisible()
  await expect.poll(() => page.url()).not.toContain('do=')
  expect(route(page)).toContain('panel=bestiary')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.reload()
  await expect(page.locator('#bestiary-search')).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('the switcher takes the DM to an action that opens its dialog', async ({ page }) => {
  await dmPage(page)
  await page.goto(home)
  await openByKeyboard(page)
  await field(page).fill('repartir')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('searchbox', { name: 'Buscar objeto para añadir' })).toBeVisible()
  await expect.poll(() => page.url()).not.toContain('do=')
  await expect(switcher(page)).toHaveCount(0)
})

test('the command centre entry is current on the campaign index and on Members only', async ({
  page,
}, info) => {
  await dmPage(page)
  const phone = (page.viewportSize()?.width ?? 0) < 768
  const nav = phone
    ? page.locator('nav.bottom-nav')
    : page.getByRole('navigation', { name: 'Navegación principal' }).first()
  const dm = nav.getByRole('link', { name: /Centro de mando DM/ })
  const current = nav.locator('[aria-current="page"]')
  for (const [path, marked] of [
    ['', true],
    ['/members', true],
    ['/members?panel=bestiary', true],
    ['/combat', false],
  ] as const) {
    await page.goto(`${home}${path}`)
    await expect(dm).toBeVisible()
    if (marked) {
      await expect(dm).toHaveAttribute('aria-current', 'page')
      await expect(dm).toHaveClass(/active/)
      await expect(current).toHaveCount(1)
    } else {
      await expect(dm).not.toHaveAttribute('aria-current', 'page')
      await expect(dm).not.toHaveClass(/(^|\s)active(\s|$)/)
      await expect(current).toHaveCount(1)
    }
  }
  expect(info.project.name).toBeTruthy()
})

for (const theme of ['default', 'parchment'] as const) {
  test(`the open switcher passes axe, keeps 44px targets and fits (${theme})`, async ({
    page,
  }, info) => {
    await page.addInitScript((value) => localStorage.setItem('rytta-theme', value), theme)
    await dmPage(page)
    await page.goto(`${membersUrl}?panel=items`)
    await openByKeyboard(page)
    await expect(switcher(page)).toBeVisible()
    await expect(switcher(page).getByRole('option')).toHaveCount(14)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([])
    await expectTouchTargets(page, '[role="dialog"] button:visible, [role="dialog"] input:visible')
    await expectTouchTargets(page, '[role="dialog"] [role="option"]:visible')
    await field(page).fill('zzz')
    await expect(switcher(page).getByRole('option')).toHaveCount(0)
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([])
    await field(page).fill('')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')
    if (process.env.RYT_EVIDENCE) {
      // Colours ease between rows; let the last move settle before the capture.
      await page.waitForTimeout(500)
      await page.screenshot({
        path: `docs/evidence/RYT-179/after/switcher-${info.project.name}-${theme}.png`,
      })
    }
  })
}

test('the same switcher works in English', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('rytta-language', 'en'))
  await dmPage(page)
  await page.goto(home)
  await page.getByRole('button', { name: 'Find a panel or action' }).click()
  const dialog = page.getByRole('dialog', { name: 'Go to' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('combobox', { name: 'Find a panel or action' }).fill('loot')
  await expect(dialog.getByRole('option')).toHaveText(['Distribute loot'])
  await dialog.getByRole('combobox').fill('party level')
  await expect(dialog.getByRole('option')).toHaveText(['Party level', 'Set party level'])
  await dialog.getByRole('combobox').fill('nothing-here')
  await expect(dialog.locator('.switcher-empty')).toContainText('Nothing matches “nothing-here”')
})

test('keys typed right after Ctrl+K are not lost', async ({ page }) => {
  await dmPage(page)
  await page.goto(home)
  await expect(trigger(page)).toBeVisible()
  // No wait between the shortcut and the first characters: the field may not have focus yet.
  await page.keyboard.press('Control+k')
  await page.keyboard.type('nivel')
  await expect(field(page)).toHaveValue('nivel')
  await expect(field(page)).toBeFocused()
  await expect(
    switcher(page).getByRole('option', { name: 'Nivel del grupo', exact: true }),
  ).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(switcher(page)).toHaveCount(0)
  await page.keyboard.press('/')
  await page.keyboard.type('dados')
  await expect(field(page)).toHaveValue('dados')
})

test('a key pressed on the close button activates it and is not typed into the query', async ({
  page,
}) => {
  await dmPage(page)
  await page.goto(home)
  await openByKeyboard(page)
  await expect(field(page)).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(switcher(page).getByRole('button', { name: 'Cerrar búsqueda' })).toBeFocused()
  await page.keyboard.press('Space')
  await expect(switcher(page)).toHaveCount(0)
  await openByKeyboard(page)
  await expect(field(page)).toHaveValue('')
})

test('at 390x667 and 150% text the list fits the screen and its group label stays while it scrolls', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'identity-mobile', 'phone geometry')
  await page.setViewportSize({ width: 390, height: 667 })
  await dmPage(page)
  await page.addInitScript(() => {
    document.documentElement.style.fontSize = '150%'
  })
  await page.goto(`${membersUrl}?panel=items`)
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '150%'
  })
  await openByKeyboard(page)
  const dialog = switcher(page)
  await expect(dialog).toBeVisible()
  const box = (await dialog.boundingBox())!
  expect(box.y).toBeGreaterThanOrEqual(0)
  expect(box.y + box.height).toBeLessThanOrEqual(667)
  // The field opens focused, and a focused field paints no ellipsis: the placeholder itself must
  // fit, measured as painted (its text width against the room inside the field).
  await expect(field(page)).toBeFocused()
  const room = await placeholderRoom(field(page))
  expect(room.placeholder.length).toBeGreaterThan(3)
  expect(room.text).toBeLessThanOrEqual(room.room)
  // The accessible name stays the full question.
  await expect(field(page)).toHaveAttribute('aria-label', 'Buscar panel o acción')
  const list = dialog.getByRole('listbox')
  const listBox = (await list.boundingBox())!
  expect(listBox.y + listBox.height).toBeLessThanOrEqual(667)
  await list.evaluate((node) => {
    node.scrollTop = node.scrollHeight
  })
  // The label of the group now under the top edge is stuck there.
  const labels = dialog.locator('.switcher-group-label')
  const stuck = await labels.evaluateAll((nodes, top) => {
    return nodes.filter((node) => {
      const rect = node.getBoundingClientRect()
      return rect.top >= top - 1 && rect.top <= top + 4
    }).length
  }, listBox.y)
  expect(stuck).toBe(1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('the navigation counts say their unit; the full sentence stays as the description', async ({
  page,
}) => {
  await dmPage(page, { catalogue: true })
  await page.route('**/rest/v1/campaign_invitations?**', (route) =>
    route.fulfill({
      json: [
        {
          id: '90000000-0000-4000-8000-000000000002',
          email: 'wait@example.com',
          expires_at: '2099-01-01T00:00:00Z',
        },
      ],
    }),
  )
  await page.goto(`${membersUrl}?panel=dice`)
  const phone = (page.viewportSize()?.width ?? 0) < 768
  let links = page.getByRole('navigation', { name: 'Centro de mando DM' })
  if (phone) {
    await page.getByRole('button', { name: /cambiar de panel/ }).click()
    links = page.getByRole('dialog', { name: 'Centro de mando DM' }).getByRole('navigation')
  }
  const members = links.getByRole('link', { name: 'Miembros', exact: true })
  await expect(members).toContainText('1 pendiente')
  await expect(members).toHaveAccessibleDescription('1 invitación por aceptar')
  const store = links.getByRole('link', { name: 'Almacén de objetos', exact: true })
  await expect(store).toContainText('1 por revisar')
  await expect(store).toHaveAccessibleDescription('1 propuesta por revisar')
})

test('on the home a failed party, proposal or session query says so with a retry', async ({
  page,
}) => {
  await dmPage(page, { catalogue: true })
  let failing = true
  for (const rpc of ['get_party_overview', 'list_item_proposals', 'get_session_continuity'])
    await page.route(`**/rest/v1/rpc/${rpc}`, (route) =>
      failing
        ? route.fulfill({ status: 503, json: { message: 'Service unavailable' } })
        : route.fallback(),
    )
  await page.goto(home)
  const pending = page.getByRole('region', { name: 'Pendiente' })
  await expect(pending.getByRole('alert')).toBeVisible()
  const table = page.getByRole('region', { name: 'En la mesa' })
  await expect(table.getByRole('alert')).toBeVisible()
  await expect(table.getByRole('link', { name: 'Almacén de objetos' })).toBeVisible()
  failing = false
  await pending.getByRole('button', { name: 'Reintentar' }).click()
  await table.getByRole('button', { name: 'Reintentar' }).click()
  await expect(pending.getByRole('alert')).toHaveCount(0)
  await expect(table.getByRole('alert')).toHaveCount(0)
})
