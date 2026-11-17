// RYT-113: the older suites reuse one DM for many campaigns and invitations within seconds and
// re-invite after a decline. They test other rules, so they lift the throttles after migrating;
// tests/database/open-signup-hardening.test.ts covers the shipped defaults.
export const relaxQuotasSql = `do $relax$
declare helper text;
begin
  foreach helper in array array['private', 'pre_private'] loop
    if to_regclass(format('%I.quota_limits', helper)) is not null then
      execute format('update %I.quota_limits set max_count = 100000 where quota in
        (''invitations_per_hour'', ''pending_invitations_per_inviter'', ''campaigns_per_owner'')', helper);
      execute format('update %I.quota_limits set max_count = 0 where quota = ''decline_cooldown_days''', helper);
    end if;
  end loop;
end;
$relax$;`
