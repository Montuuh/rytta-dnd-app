-- RYT-155: the combat log keeps a teammate's concentration private.
-- set_concentration and apply_combat_hp log the spell name (detail.spell, detail.concentration,
-- detail.concentration_dc, detail.concentration_lost) with the fight's own visibility, and
-- get_combat_state returned every visible event's detail to every member and the table screen,
-- although the same projection hides the concentration of a character that is not the viewer's,
-- does not share live state, or plays under an alias (RYT-118).
--
-- What. public.get_combat_state (latest definition 20261128120000, same signature and grants), for
-- a viewer who is not the DM's full view and an event whose target is a character whose
-- concentration that viewer may not see (not the viewer's own off the table screen, and not
-- shared: live sharing off, an alias, or a character no Player owns), or a target that left the
-- fight (the rule can no longer be checked); any unknown hides:
--   - leaves out 'concentration' events, and undo events of one, altogether (without the spell
--     they would read as an end of concentration, which may be false);
--   - returns other events (damage, for example) without those four keys.
-- Events about creatures, the DM's view and the viewer's own character are unchanged. Nothing
-- stored is rewritten.
--
-- How. The function is patched in place: its definition is read with pg_get_functiondef, each
-- exact expected line must appear once (else the migration fails and nothing changes), they are
-- replaced and the definition executed again. CREATE OR REPLACE keeps the owner, SECURITY DEFINER,
-- search_path and grants; grants are restated anyway. The PRE copy (pre.get_combat_state) is
-- patched the same way when it exists.
--
-- Security. A read narrows; no write path, table, policy or grant changes.
do $migration$
declare
  -- Any unknown (a character without a Player, a missing row) hides rather than shows.
  masked text := $m$coalesce((x.target_combatant is not null and (tc.id is null or (tc.kind = 'character'
              and not (ch.user_id is not distinct from viewer and not coalesce(as_table, false))
              and not (ch.user_id is not null and ch.shares_live and tc.public_name is null)))), true)$m$;
  detail_old text := $old$          'detail', x.detail,$old$;
  detail_new text := $new$          -- RYT-155: a character's concentration stays where the projection shows it.
          'detail', case when not full_view and @masked
            then x.detail - 'spell' - 'concentration' - 'concentration_dc' - 'concentration_lost'
            else x.detail end,$new$;
  where_old text := $old$      where x.encounter_id = e.id and (full_view or (x.visible and not coalesce(tc.hidden, false)$old$;
  where_new text := $new$      where x.encounter_id = e.id and (full_view or (x.visible and not coalesce(tc.hidden, false)
        and not ((x.kind = 'concentration'
          or (x.kind = 'undo' and x.detail ->> 'undo_kind' = 'concentration')) and @masked)$new$;
  fn text;
  src text;
begin
  detail_new := replace(detail_new, '@masked', masked);
  where_new := replace(where_new, '@masked', masked);
  foreach fn in array array['public.get_combat_state(uuid,uuid,boolean)', 'pre.get_combat_state(uuid,uuid,boolean)'] loop
    if to_regprocedure(fn) is null then continue; end if;
    src := replace(pg_get_functiondef(fn::regprocedure), chr(13), '');
    if (char_length(src) - char_length(replace(src, detail_old, ''))) / char_length(detail_old) <> 1
        or (char_length(src) - char_length(replace(src, where_old, ''))) / char_length(where_old) <> 1 then
      raise exception 'Unexpected body of %; not patched', fn;
    end if;
    execute replace(replace(src, detail_old, detail_new), where_old, where_new);
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end;
$migration$;
