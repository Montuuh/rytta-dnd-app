-- RYT-110 follow-up: spell slots created with Font of Magic last until a Long Rest.
-- The sheet keeps them in character_vitals.tracker_uses as `font-slot-<level>` (not a tracker of
-- the build). private.rest_effect keeps only uses of the sheet's trackers, so any rest cleared
-- them. Now a short rest keeps `font-slot-` uses and a long rest still clears them, as the SRD
-- says. Nothing else in the rest changes.
-- Security: patches the body of the existing private security-definer helper in place (same
-- signature, privileges and owner); execute stays revoked from public, anon and authenticated.
-- The patch is applied only when the exact expected text is found, otherwise the migration
-- fails, so a drifted function is never rewritten blindly. No table, policy or data change.
do $migration$
declare
  fn text;
  src text;
  old_filter text := $old$    where not can_rest or exists (select 1 from jsonb_array_elements(trackers) t where t ->> 'id' = u.key
      and not (t ->> 'reset' = 'short' or (rest_kind = 'long' and t ->> 'reset' = 'long')));$old$;
  new_filter text := $new$    where not can_rest or (rest_kind <> 'long' and u.key like 'font-slot-%')
      or exists (select 1 from jsonb_array_elements(trackers) t where t ->> 'id' = u.key
      and not (t ->> 'reset' = 'short' or (rest_kind = 'long' and t ->> 'reset' = 'long')));$new$;
begin
  old_filter := replace(old_filter, chr(13), '');
  new_filter := replace(new_filter, chr(13), '');
  foreach fn in array array['private.rest_effect(uuid,uuid,text,integer,integer)',
      'pre_private.rest_effect(uuid,uuid,text,integer,integer)'] loop
    if to_regprocedure(fn) is null then continue; end if;
    -- Line endings depend on how the defining migration was sent; compare without carriage returns.
    src := replace(pg_get_functiondef(fn::regprocedure), chr(13), '');
    if position(old_filter in src) = 0 then
      raise exception 'Unexpected body of %; not patched', fn;
    end if;
    execute replace(src, old_filter, new_filter);
    execute format('revoke all on function %s from public, anon, authenticated', fn);
  end loop;
end;
$migration$;
