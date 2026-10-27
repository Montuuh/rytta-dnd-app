import { loadEnv } from 'vite'

// Public-only connection smoke. No account creation, completed login, email or application-data writes.
// The OAuth preflight may create temporary Auth flow state, which expires automatically.
const env = loadEnv('development', process.cwd(), 'VITE_')
const url = env.VITE_SUPABASE_URL
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY
if (!url || !key?.startsWith('sb_publishable_'))
  throw new Error('Configure the project URL and public Publishable key in .env.local first.')
const headers = { apikey: key, 'Content-Type': 'application/json' }
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
authorize.searchParams.set('redirect_to', 'http://localhost:5173/')
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

console.log(
  'PASS: Supabase Auth reachable; Google enabled; registration open; Google PKCE redirect configured; four anonymous API operations denied.',
)
console.log(
  'Not tested: Google consent/sign-in, authenticated JWT API calls, or the frontend callback round trip.',
)
