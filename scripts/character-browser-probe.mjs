// Optional browser-to-PostgreSQL contract probe. Local SQL auth shim, not hosted Auth/PostgREST.
import { chromium, expect } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
export async function verifyCharacterBrowsers({ Client, config, db, dm }) {
  const browser = await chromium.launch()
  const evidence = 'docs/evidence/RYT-003/integration'
  mkdirSync(evidence, { recursive: true })
  const base = 'http://127.0.0.1:4175/rytta-dnd-app/'
  const errors = []
  async function pageFor(id, email, width = 390) {
    const context = await browser.newContext({ viewport: { width, height: 1000 } })
    const page = await context.newPage()
    page.on('pageerror', (error) => errors.push(error.message))
    const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')
    const exp = Math.floor(Date.now() / 1000) + 3600
    const session = {
      access_token: `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: id, email, role: 'authenticated', exp })}.fixture`,
      refresh_token: 'fixture',
      expires_in: 3600,
      expires_at: exp,
      token_type: 'bearer',
      user: {
        id,
        email,
        aud: 'authenticated',
        role: 'authenticated',
        app_metadata: { provider: 'google' },
        user_metadata: {},
        created_at: new Date().toISOString(),
      },
    }
    await page.addInitScript(
      (value) => localStorage.setItem('sb-rytta-test-auth-token', JSON.stringify(value)),
      session,
    )
    await page.route('https://rytta-test.supabase.co/**', async (route) => {
      const connection = new Client(config)
      const url = new URL(route.request().url())
      const method = url.pathname.split('/').at(-1)
      const reply = (data, status = 200) =>
        route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) })
      try {
        if (url.pathname.includes('/auth/')) return await reply(session.user)
        await connection.connect()
        await connection.query('set role authenticated')
        await connection.query("select set_config('request.jwt.claim.sub',$1,false)", [id])
        if (method === 'characters') {
          const result = await connection.query(
            `select c.id,c.campaign_id,c.user_id,c.name,
            jsonb_build_object('gold',r.gold,'water_units',r.water_units,'rations',r.rations,'exhaustion',r.exhaustion,'revision',r.revision) character_resources
            from public.characters c join public.character_resources r on r.character_id=c.id and r.campaign_id=c.campaign_id
            where c.campaign_id=$1 order by c.created_at`,
            [url.searchParams.get('campaign_id')?.replace('eq.', '')],
          )
          return await reply(
            result.rows.map((row) => ({ ...row, character_resources: [row.character_resources] })),
          )
        }
        const allowed = [
          'list_my_campaigns',
          'list_my_invitations',
          'create_character',
          'invite_character_player',
          'respond_campaign_invitation',
          'set_character_resources',
        ]
        if (!allowed.includes(method)) throw new Error(`Unexpected route ${method}`)
        const args = route.request().postDataJSON() || {}
        const keys = Object.keys(args)
        if (keys.some((k) => !/^\w+$/.test(k))) throw new Error('Invalid argument')
        const call = `public.${method}(${keys.map((k, i) => `${k} => $${i + 1}`).join(',')})`
        const list = method.startsWith('list_')
        const result = await connection.query(
          list ? `select * from ${call}` : `select ${call} result`,
          Object.values(args),
        )
        return await reply(list ? result.rows : result.rows[0].result)
      } catch (error) {
        return await reply({ message: error.message }, 400)
      } finally {
        await connection.end().catch(() => {})
      }
    })
    return page
  }
  try {
    const campaign = (
      await db.query("select public.create_campaign('Browser integration table') id")
    ).rows[0].id
    const route = `${base}#/campaign/${campaign}/party`
    const first = await pageFor(dm, 'dm@example.com')
    await first.goto(route)
    await first.getByRole('button', { name: 'Crear personaje', exact: true }).click()
    await first.getByLabel('Nombre del personaje').fill('Future hero')
    await first
      .getByRole('dialog')
      .getByRole('button', { name: 'Crear personaje', exact: true })
      .click()
    await expect(first.getByRole('heading', { name: 'Future hero' })).toBeVisible()
    await first.getByRole('button', { name: 'Invitar jugador', exact: true }).click()
    await first.getByLabel('Correo de la cuenta de Google').fill('future-browser@example.com')
    await first
      .getByRole('dialog')
      .getByRole('button', { name: 'Invitar jugador', exact: true })
      .click()
    await expect(first.getByRole('status')).toContainText('Invitación creada')
    const future = randomUUID()
    await db.query('reset role')
    await db.query('insert into auth.users(id,email,email_confirmed_at) values ($1,$2,now())', [
      future,
      'future-browser@example.com',
    ])
    await db.query('set role authenticated')
    const player = await pageFor(future, 'future-browser@example.com')
    await player.goto(base)
    await expect(player.getByText('Personaje: Future hero')).toBeVisible()
    await player.getByRole('button', { name: 'Aceptar invitación' }).click()
    await player.getByRole('link', { name: 'Abrir campaña: Browser integration table' }).click()
    await player.goto(route)
    await expect(player.getByText('Tu personaje', { exact: true })).toBeVisible()
    await expect(player.getByRole('button', { name: 'Editar recursos' })).toHaveCount(0)
    const second = await pageFor(dm, 'dm@example.com', 820)
    await second.goto(route)
    await first.getByRole('button', { name: 'Editar recursos' }).click()
    await second.getByRole('button', { name: 'Editar recursos' }).click()
    await first.getByRole('textbox', { name: 'Oro', exact: true }).fill('51')
    await first.getByRole('button', { name: 'Guardar recursos' }).click()
    await expect(first.getByText('Recursos guardados.')).toBeVisible()
    await second.getByRole('textbox', { name: 'Oro', exact: true }).fill('99')
    await second.getByRole('button', { name: 'Guardar recursos' }).click()
    await expect(second.getByRole('alert')).toContainText('Otro DM')
    await second.screenshot({ path: `${evidence}/tablet-stale.png`, fullPage: true })
    await player.getByRole('button', { name: 'Actualizar', exact: true }).click()
    await expect(player.getByText('51', { exact: true })).toBeVisible()
    await player.screenshot({ path: `${evidence}/phone-player.png`, fullPage: true })
    await first.screenshot({ path: `${evidence}/phone-dm.png`, fullPage: true })
    expect(errors).toEqual([])
    console.log(
      'PASS PostgreSQL-backed browsers: DM creates/invites before account existence; new Player accepts read-only character; two DM devices reject stale edits; Player refresh sees committed gold.',
    )
  } finally {
    await browser.close()
  }
}
