-- RYT-147: activation and return of campaigns, by weekly cohort. Read only; run as the project
-- owner (database connector or SQL editor). Not a migration: nothing is created, no function or
-- view is exposed to anon or authenticated callers. Definitions and how to read the result:
-- docs/metrics.md. The result holds counts only, never an id, a name or an address.
--
-- Optional: `set rytta.report_now = '2026-12-31T00:00:00Z'` before running to evaluate the
-- report at another moment (used by the tests); otherwise the clock is now().
with params as (
  select
    coalesce(nullif(current_setting('rytta.report_now', true), '')::timestamptz, now()) as at,
    timestamptz '2026-11-18T00:00:00Z' as launch,
    interval '14 days' as activation_window,
    interval '28 days' as return_window
),
-- Excluded people: test accounts (scripts/test-accounts.mjs) and the owner's own accounts, marked
-- with app_metadata.rytta_internal = true (docs/metrics.md, "Exclusions").
excluded as (
  select u.id
  from auth.users u
  where coalesce(u.raw_app_meta_data ->> 'rytta_internal', '') = 'true'
     or coalesce(u.raw_user_meta_data ->> 'rytta_test_account', '') = 'true'
),
cohort as (
  select c.id, c.created_at
  from public.campaigns c, params p
  where c.created_at >= p.launch
    and c.created_at <= p.at
    and (c.owner_id is null or c.owner_id not in (select id from excluded))
    and not exists (
      select 1 from public.campaign_members m
      where m.campaign_id = c.id and m.role = 'dm' and m.user_id in (select id from excluded)
    )
),
second_member as (
  select ranked.campaign_id, ranked.joined_at
  from (
    select m.campaign_id, m.joined_at,
      row_number() over (partition by m.campaign_id order by m.joined_at, m.user_id) as position
    from public.campaign_members m
    join cohort c on c.id = m.campaign_id
  ) ranked
  where ranked.position = 2
),
started as (
  select e.campaign_id, e.started_at
  from public.encounters e
  join cohort c on c.id = e.campaign_id, params p
  where e.started_at is not null
    and e.started_at < c.created_at + p.activation_window
    and e.started_at <= p.at
),
activated as (
  select s.campaign_id, min(s.started_at) as at
  from started s
  join second_member m on m.campaign_id = s.campaign_id and s.started_at >= m.joined_at
  group by s.campaign_id
),
solo as (
  select distinct s.campaign_id
  from started s
  where s.campaign_id not in (select campaign_id from activated)
),
dm_activity as (
  select a.campaign_id, a.at
  from (
    select campaign_id, actor_id as who, created_at as at from public.campaign_events
    union all select campaign_id, actor_id, created_at from public.character_events
    union all select campaign_id, actor_id, created_at from public.inventory_events
    union all select campaign_id, actor_id, created_at from public.encounter_events
    union all select campaign_id, created_by, created_at from public.encounters
    union all select campaign_id, created_by, started_at from public.encounters
      where started_at is not null
    union all select campaign_id, created_by, created_at from public.item_definitions
    union all select campaign_id, created_by, created_at from public.tabletop_scenes
    union all select campaign_id, created_by, created_at from public.campaign_invitations
    union all select campaign_id, created_by, created_at from public.glossary_entries
  ) a
  join public.campaign_members m
    on m.campaign_id = a.campaign_id and m.user_id = a.who and m.role = 'dm'
),
returned as (
  select x.campaign_id
  from activated x
  join dm_activity d on d.campaign_id = x.campaign_id, params p
  where d.at > x.at
    and d.at <= p.at
    and d.at < x.at + p.return_window
    and (d.at at time zone 'UTC')::date <> (x.at at time zone 'UTC')::date
  group by x.campaign_id
),
rows as (
  select
    date_trunc('week', c.created_at at time zone 'UTC')::date as cohort_week,
    c.created_at + p.activation_window <= p.at as activation_settled,
    x.campaign_id is not null as activated,
    o.campaign_id is not null as solo_only,
    x.at is not null and x.at + p.return_window <= p.at as return_settled,
    r.campaign_id is not null as returned
  from cohort c
  cross join params p
  left join activated x on x.campaign_id = c.id
  left join solo o on o.campaign_id = c.id
  left join returned r on r.campaign_id = c.id
)
select
  case when grouping(cohort_week) = 1 then 'total' else cohort_week::text end as cohort_week,
  count(*) as campaigns,
  count(*) filter (where activation_settled) as activation_denominator,
  count(*) filter (where activated) as activated,
  count(*) filter (where activated and activation_settled) as activated_settled,
  round(
    100.0 * count(*) filter (where activated and activation_settled)
      / nullif(count(*) filter (where activation_settled), 0), 1
  ) as activation_pct,
  count(*) filter (where solo_only) as solo_preparation,
  count(*) filter (where return_settled) as return_denominator,
  count(*) filter (where returned and return_settled) as returned_settled,
  round(
    100.0 * count(*) filter (where returned and return_settled)
      / nullif(count(*) filter (where return_settled), 0), 1
  ) as return_pct,
  count(*) filter (where returned) as returned_so_far
from rows
group by grouping sets ((cohort_week), ())
order by grouping(cohort_week), cohort_week;
