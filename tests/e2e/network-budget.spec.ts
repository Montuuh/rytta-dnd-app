import { test, expect, type Page } from '@playwright/test'
import { campaignId, identityFixture } from './fixtures/identity.ts'
import { realtimeFixture } from './fixtures/realtime.ts'

/**
 * RYT-114: request volume of an idle tab. The Supabase contract fixture answers every call, the
 * page clock is faked, and each request to the project is counted per endpoint family.
 */
const origin = 'https://rytta-test.supabase.co'
const inventoryUrl = `./campaign/${campaignId}/inventory`
const membersUrl = `./campaign/${campaignId}/members`

const families: Record<string, RegExp> = {
  campaigns: /^rpc\/list_my_campaigns/,
  invitations: /^rpc\/list_my_invitations$/,
  members: /^rpc\/list_campaign_members$/,
  trades: /^rpc\/get_trade_state$/,
  rest: /^rpc\/get_rest_state$/,
  combat: /^rpc\/get_combat_state$|^encounters/,
  glossary: /glossary/,
}

function counter(page: Page) {
  const counts: Record<string, number> = {}
  const raw: Record<string, number> = {}
  page.on('request', (request) => {
    if (!request.url().startsWith(origin)) return
    const { pathname } = new URL(request.url())
    if (pathname.startsWith('/storage/v1/object/sign/')) {
      const key = `sign:${pathname.split('/')[5]}`
      counts[key] = (counts[key] ?? 0) + 1
      return
    }
    const rest = pathname.replace('/rest/v1/', '')
    if (rest === pathname) return
    raw[rest] = (raw[rest] ?? 0) + 1
    for (const [family, pattern] of Object.entries(families))
      if (pattern.test(rest)) counts[family] = (counts[family] ?? 0) + 1
  })
  return {
    snapshot: () => ({ ...counts }),
    raw: () => ({ ...raw }),
    since(before: Record<string, number>) {
      const out: Record<string, number> = {}
      for (const key of new Set([...Object.keys(counts), ...Object.keys(before)]))
        out[key] = (counts[key] ?? 0) - (before[key] ?? 0)
      return out
    },
  }
}

/** Advance the page clock in steps so every interval fires and its request can settle. */
async function idle(page: Page, ms: number) {
  for (let spent = 0; spent < ms; spent += 5_000) {
    await page.clock.runFor(5_000)
    await page.waitForTimeout(15)
  }
}

async function prepare(page: Page, dm = false) {
  const fixture = await identityFixture(page, { player: !dm, sheet: 'complete', inventory: true })
  // Every item carries a picture: the satchel signs them together, not one request each.
  fixture.inventory.definitions.forEach((definition, i) => {
    definition.image_path = `pre/${campaignId}/items/${i}.webp`
  })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.clock.install()
}

const joined = (joins: string[], table: string) =>
  joins.some((t) => t.startsWith(`realtime:${table}:`))
const minutes = 5

test('RYT-114 a Player tab idle for five minutes with realtime up stays inside the request budget', async ({
  page,
}, info) => {
  test.setTimeout(120_000)
  const realtime = await realtimeFixture(page)
  await prepare(page)
  const requests = counter(page)
  await page.goto(inventoryUrl)
  await expect(page.getByRole('button', { name: /Poción de curación, cantidad 3/ })).toBeVisible()
  await expect.poll(() => joined(realtime.joins, 'trades')).toBe(true)
  await expect.poll(() => joined(realtime.joins, 'rest')).toBe(true)
  await page.waitForTimeout(500)
  const loaded = requests.snapshot()
  await idle(page, minutes * 60_000)
  const counts = requests.since(loaded)
  await info.attach('idle-player-realtime-up', {
    body: JSON.stringify({ loaded, idle: counts, raw: requests.raw() }, null, 2),
    contentType: 'application/json',
  })
  console.log('player idle 5 min, realtime up', JSON.stringify(counts))
  // Minute cadence: five reads in five minutes, one more of slack for the boundary.
  expect(counts.campaigns ?? 0).toBeLessThanOrEqual(6)
  expect(counts.invitations ?? 0).toBeLessThanOrEqual(6)
  expect(counts.members ?? 0).toBe(0)
  expect(counts.trades ?? 0).toBeLessThanOrEqual(6)
  expect(counts.rest ?? 0).toBeLessThanOrEqual(6)
  expect(counts.combat ?? 0).toBe(0)
  expect(counts.glossary ?? 0).toBe(0)
  expect(requests.snapshot().glossary ?? 0).toBe(0)
  // Pictures are signed in one batch for the whole satchel and not again within the hour.
  expect(requests.snapshot()['sign:item-images'] ?? 0).toBe(1)
  expect(counts['sign:item-images'] ?? 0).toBe(0)
})

test('RYT-114 trades and rest return to the fast poll as soon as realtime goes down', async ({
  page,
}, info) => {
  test.setTimeout(120_000)
  const realtime = await realtimeFixture(page)
  await prepare(page)
  const requests = counter(page)
  await page.goto(inventoryUrl)
  await expect(page.getByRole('button', { name: /Poción de curación, cantidad 3/ })).toBeVisible()
  await expect.poll(() => joined(realtime.joins, 'trades')).toBe(true)
  await expect.poll(() => joined(realtime.joins, 'rest')).toBe(true)
  await page.waitForTimeout(500)
  const loaded = requests.snapshot()
  await idle(page, 2 * 60_000)
  const connected = requests.since(loaded)
  expect(connected.trades ?? 0).toBeLessThanOrEqual(3)

  await realtime.drop()
  const dropped = requests.snapshot()
  await idle(page, 2 * 60_000)
  const down = requests.since(dropped)
  await info.attach('idle-player-realtime-down', {
    body: JSON.stringify({ connected, down }, null, 2),
    contentType: 'application/json',
  })
  console.log('player idle 2 min, realtime up', JSON.stringify(connected))
  console.log('player idle 2 min, realtime down', JSON.stringify(down))
  // The channel error refetches at once and the 10 s trade and 30 s rest cadence resumes.
  expect(down.trades ?? 0).toBeGreaterThanOrEqual(10)
  expect(down.rest ?? 0).toBeGreaterThanOrEqual(3)
  // Campaigns have no realtime channel: the minute cadence does not depend on it.
  expect(down.campaigns ?? 0).toBeLessThanOrEqual(3)
  expect(down.glossary ?? 0).toBe(0)
})

test('RYT-114 a DM tab idle for five minutes reads members once a minute', async ({
  page,
}, info) => {
  test.setTimeout(120_000)
  const realtime = await realtimeFixture(page)
  await prepare(page, true)
  const requests = counter(page)
  await page.goto(membersUrl)
  await expect.poll(() => realtime.joins.length).toBeGreaterThan(0)
  await page.waitForTimeout(500)
  const loaded = requests.snapshot()
  await idle(page, minutes * 60_000)
  const counts = requests.since(loaded)
  await info.attach('idle-dm-realtime-up', {
    body: JSON.stringify({ loaded, idle: counts, raw: requests.raw() }, null, 2),
    contentType: 'application/json',
  })
  console.log('dm idle 5 min, realtime up', JSON.stringify(counts))
  expect(counts.members ?? 0).toBeLessThanOrEqual(6)
  expect(counts.campaigns ?? 0).toBeLessThanOrEqual(6)
  expect(counts.glossary ?? 0).toBe(0)
})
