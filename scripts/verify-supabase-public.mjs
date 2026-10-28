import { loadEnv } from 'vite'

// Public-only connection smoke. No account creation, completed login, email or application-data writes.
// The OAuth preflight may create temporary Auth flow state, which expires automatically.
const env = loadEnv('development', process.cwd(), 'VITE_')
const url = env.VITE_SUPABASE_URL
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY
if (!url || !key?.startsWith('sb_publishable_'))
  throw new Error('Configure the project URL and public Publishable key in .env.local first.')
const headers = { apikey: key, 'Content-Type': 'application/json' }
// Pass the exact frontend base URLs when checking a different local port/subpath.
const suppliedRedirects = process.argv.slice(2)
const redirectUrls = (
  suppliedRedirects.length
    ? suppliedRedirects
    : ['http://localhost:5174/', 'https://montuuh.github.io/rytta-dnd-app/']
).map((value) => {
  const target = new URL(value)
  if (
    !['http:', 'https:'].includes(target.protocol) ||
    target.username ||
    target.password ||
    target.search ||
    target.hash
  )
    throw new Error('Pass frontend base URLs without credentials, queries or hash routes.')
  return target
})
const settings = await fetch(`${url}/auth/v1/settings`, { headers })
if (!settings.ok) throw new Error(`Auth settings returned HTTP ${settings.status}`)
const auth = await settings.json()
if (!auth.external?.google || auth.disable_signup)
  throw new Error('Google sign-in must be enabled with registration open.')

const probes = [
  ['/rest/v1/campaigns?select=id&limit=1', { method: 'GET' }],
  ['/rest/v1/campaign_invitations?select=id&limit=1', { method: 'GET' }],
  ['/rest/v1/rpc/list_my_campaigns', { method: 'POST', body: '{}' }],
  [
    '/rest/v1/rpc/create_campaign',
    {
      method: 'POST',
      body: JSON.stringify({ campaign_name: 'Must never be created anonymously' }),
    },
  ],
]
for (const [path, init] of probes) {
  const response = await fetch(`${url}${path}`, { ...init, headers })
  const data = await response.json()
  if (![401, 403].includes(response.status) || data.code !== '42501')
    throw new Error(
      `Expected PostgreSQL permission denial for ${path}; received HTTP ${response.status}.`,
    )
}
const authorize = new URL(`${url}/auth/v1/authorize`)
authorize.searchParams.set('provider', 'google')
authorize.searchParams.set('redirect_to', redirectUrls[0].href)
authorize.searchParams.set('code_challenge', 'a'.repeat(43))
authorize.searchParams.set('code_challenge_method', 's256')
const oauth = await fetch(authorize, { headers, redirect: 'manual' })
const destination = oauth.headers.get('location')
if (![302, 303].includes(oauth.status) || !destination)
  throw new Error(`Google authorization did not redirect: HTTP ${oauth.status}`)
const google = new URL(destination)
if (
  google.hostname !== 'accounts.google.com' ||
  !google.searchParams.get('client_id') ||
  google.searchParams.get('redirect_uri') !== `${url}/auth/v1/callback`
)
  throw new Error('Unexpected Google authorization configuration.')

// An intentionally invalid token tests the server's redirect allowlist without signing
// anyone in, sending email or following the redirect. Check PKCE correlation queries too.
for (const target of redirectUrls) {
  for (const withFlowId of [false, true]) {
    const callback = new URL(target)
    if (withFlowId) callback.searchParams.set('sb_flow_id', 'rytta-redirect-smoke')
    const verify = new URL(`${url}/auth/v1/verify`)
    verify.searchParams.set('type', 'recovery')
    verify.searchParams.set('token', 'invalid-rytta-redirect-probe')
    verify.searchParams.set('redirect_to', callback.href)
    const response = await fetch(verify, { headers, redirect: 'manual' })
    const location = response.headers.get('location')
    const destination = location ? new URL(location) : null
    if (
      ![302, 303].includes(response.status) ||
      destination?.origin !== target.origin ||
      destination?.pathname !== target.pathname ||
      (withFlowId && destination?.searchParams.get('sb_flow_id') !== 'rytta-redirect-smoke')
    )
      throw new Error(
        `Auth redirect rejected ${target.origin}${target.pathname}${withFlowId ? ' with sb_flow_id' : ''}. Add the base URL and its ?sb_flow_id=* variant in Authentication > URL Configuration; a rejected callback falls back to the production Site URL.`,
      )
  }
}

console.log(
  `PASS: Supabase Auth reachable; Google enabled; registration open; Google PKCE redirect configured; four anonymous API operations denied; ${redirectUrls.length} frontend callbacks accepted, including PKCE correlation queries.`,
)
console.log(
  'Not tested: Google consent/sign-in, authenticated JWT API calls, or the frontend callback round trip.',
)
