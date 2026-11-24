#!/usr/bin/env node
/**
 * Test accounts for hosted checks. Writes SQL; never connects to Supabase and never prints a
 * password.
 *
 *   node scripts/test-accounts.mjs [labels...] [--seed-pre] [--disposable] [--out file.sql]
 *
 * - Keeps RYTTA_TEST_PASSWORD and RYTTA_TEST_INBOX in .env.local (git-ignored). A missing
 *   password is generated and appended; it is never written to stdout.
 * - Each label becomes the address <inbox local part>+<label>@<inbox domain>, so every message to
 *   a test account reaches the owner's inbox. Default labels: pre-dm pre-player pre-outsider.
 * - --disposable adds one account labelled disposable-<UTC timestamp> for a deletion check.
 * - --seed-pre adds the PRE test table: a campaign owned by pre-dm with pre-player as a Player,
 *   created through the PRE application functions. Requires the pre-dm and pre-player labels.
 * - The SQL only stores a bcrypt hash. It creates confirmed email accounts (Auth is shared by PRE
 *   and production) marked with raw_user_meta_data.rytta_test_account = true, and is idempotent:
 *   an existing account keeps its id and gets the current password hash.
 *
 * Apply the SQL with the database connector or the SQL editor, as the project owner. Then sign in
 * with the email form; see docs/test-accounts.md.
 */
import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, appendFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import bcrypt from 'bcryptjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const envPath = join(root, '.env.local')
const TEST_TABLE = 'Mesa de pruebas'

const args = process.argv.slice(2)
const flag = (name) => args.includes(name)
const outIndex = args.indexOf('--out')
const out = outIndex >= 0 ? args[outIndex + 1] : join(tmpdir(), 'rytta-test-accounts.sql')
const labels = args.filter((arg, index) => !arg.startsWith('--') && index !== outIndex + 1)
if (!labels.length) labels.push('pre-dm', 'pre-player', 'pre-outsider')
if (flag('--disposable')) {
  labels.push(`disposable-${new Date().toISOString().replace(/\D/g, '').slice(0, 12)}`)
}
for (const label of labels) {
  if (!/^[a-z0-9-]{2,40}$/.test(label)) fail(`invalid label "${label}" (use a-z, 0-9 and -)`)
}

function fail(message) {
  console.error(`test-accounts: ${message}`)
  process.exit(1)
}

function readEnv() {
  const values = {}
  if (!existsSync(envPath)) return values
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line)
    if (match) values[match[1]] = match[2].replace(/^"(.*)"$/, '$1')
  }
  return values
}

const env = readEnv()
const appended = []
let password = env.RYTTA_TEST_PASSWORD
if (!password) {
  password = randomBytes(18).toString('base64url')
  appended.push(`RYTTA_TEST_PASSWORD="${password}"`)
}
let inbox = env.RYTTA_TEST_INBOX || env.VITE_CONTACT_EMAIL
if (!inbox || !/^[^@\s+]+@[^@\s]+$/.test(inbox)) {
  fail('set RYTTA_TEST_INBOX in .env.local to an inbox you own (without a +tag)')
}
if (!env.RYTTA_TEST_INBOX) appended.push(`RYTTA_TEST_INBOX="${inbox}"`)
if (appended.length) {
  const header = '\n# Test accounts (scripts/test-accounts.mjs). Never commit.\n'
  appendFileSync(envPath, header + appended.join('\n') + '\n')
}

const [local, domain] = inbox.split('@')
const emailOf = (label) => `${local}+${label}@${domain}`.toLowerCase()
const hash = bcrypt.hashSync(password, 10)
const quote = (value) => `'${String(value).replace(/'/g, "''")}'`

const statements = labels.map((label) => {
  const email = quote(emailOf(label))
  return `do $$
declare uid uuid;
begin
  select id into uid from auth.users where lower(email) = ${email};
  if uid is null then
    uid := gen_random_uuid();
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change, email_change_token_new)
    values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated',
      ${email}, ${quote(hash)}, now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('rytta_test_account', true, 'label', ${quote(label)}),
      now(), now(), '', '', '', '');
    insert into auth.identities (provider_id, user_id, identity_data, provider,
      last_sign_in_at, created_at, updated_at)
    values (uid::text, uid, jsonb_build_object('sub', uid::text, 'email', ${email},
      'email_verified', true, 'phone_verified', false), 'email', now(), now(), now());
  else
    if coalesce((select raw_user_meta_data ->> 'rytta_test_account' from auth.users
        where id = uid), 'false') <> 'true' then
      raise exception '% exists and is not a test account', ${email};
    end if;
    update auth.users set encrypted_password = ${quote(hash)},
      email_confirmed_at = coalesce(email_confirmed_at, now()), updated_at = now()
      where id = uid;
  end if;
end $$;`
})

if (flag('--seed-pre')) {
  if (!labels.includes('pre-dm') || !labels.includes('pre-player')) {
    fail('--seed-pre needs the pre-dm and pre-player labels')
  }
  const dm = quote(emailOf('pre-dm'))
  const player = quote(emailOf('pre-player'))
  statements.push(`do $$
declare
  dm uuid := (select id from auth.users where lower(email) = ${dm});
  player uuid := (select id from auth.users where lower(email) = ${player});
  campaign uuid;
  invitation uuid;
begin
  select c.id into campaign from pre.campaigns c
    where c.owner_id = dm and c.name = ${quote(TEST_TABLE)} limit 1;
  perform set_config('role', 'authenticated', true);
  if campaign is null then
    perform set_config('request.jwt.claim.sub', dm::text, true);
    perform set_config('request.jwt.claims',
      json_build_object('sub', dm, 'role', 'authenticated')::text, true);
    campaign := pre.create_campaign(${quote(TEST_TABLE)}, 'Hosted checks with test accounts.');
  end if;
  if not exists (select 1 from pre.campaign_members m
      where m.campaign_id = campaign and m.user_id = player) then
    perform set_config('request.jwt.claim.sub', dm::text, true);
    perform set_config('request.jwt.claims',
      json_build_object('sub', dm, 'role', 'authenticated')::text, true);
    invitation := pre.invite_campaign_member(campaign, ${player});
    perform set_config('request.jwt.claim.sub', player::text, true);
    perform set_config('request.jwt.claims',
      json_build_object('sub', player, 'role', 'authenticated', 'email', ${player})::text, true);
    perform pre.respond_campaign_invitation(invitation, true);
  end if;
  perform set_config('role', 'postgres', true);
end $$;`)
}

writeFileSync(
  out,
  `-- Generated by scripts/test-accounts.mjs. Contains a password hash: delete after use.\n${statements.join('\n\n')}\n`,
)
console.log(`SQL written to ${out}`)
for (const label of labels) console.log(`  ${label}: ${emailOf(label)}`)
if (appended.length)
  console.log('Added the missing test settings to .env.local (password not shown).')
