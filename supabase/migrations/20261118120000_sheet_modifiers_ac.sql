-- RYT-101: server-side AC calculation supports Monk/Barbarian/Draconic Unarmored Defense,
-- enchanted armor (properties.acBonus), non-shield equipped items with acBonus, Defense
-- fighting style, Dual Wielder, and manual build.acBonus while preserving acOverride.
-- Includes the guarded pre_admin.remap block so PRE stays aligned when migrated.

do $sheetac$
declare
  ddl text := $ddl$
create or replace function private.recompute_armor_class(target_campaign uuid, target_character uuid) returns void
language plpgsql security definer set search_path = '' as $fn$
declare
  sheet public.character_sheets;
  dex_mod integer;
  con_mod integer;
  wis_mod integer;
  cha_mod integer;
  armor jsonb;
  shield jsonb;
  has_shield boolean := false;
  shield_bonus integer := 0;
  extra_items integer := 0;
  class_key text;
  subclass_key text;
  subclass_txt text;
  lvl integer;
  feats jsonb;
  rem jsonb;
  monk_ok boolean := false;
  barb_ok boolean := false;
  draconic_ok boolean := false;
  defense_ok boolean := false;
  dual_wield boolean := false;
  base_ac integer;
  ac integer;
begin
  select * into sheet from public.character_sheets
    where campaign_id = target_campaign and character_id = target_character for update;
  if sheet.character_id is null or sheet.build -> 'baseAbilities' is null then return; end if;

  if jsonb_typeof(sheet.build -> 'acOverride') = 'number' then
    ac := greatest(0, least(99, (sheet.build ->> 'acOverride')::integer));
    if ac is distinct from sheet.armor_class then
      update public.character_sheets set armor_class = ac
        where campaign_id = target_campaign and character_id = target_character;
    end if;
    return;
  end if;

  dex_mod := floor((least(30, coalesce((sheet.build #>> '{baseAbilities,dex}')::integer, 10)
    + coalesce((sheet.build #>> '{bonuses,dex}')::integer, 0)) - 10) / 2.0)::integer;
  con_mod := floor((least(30, coalesce((sheet.build #>> '{baseAbilities,con}')::integer, 10)
    + coalesce((sheet.build #>> '{bonuses,con}')::integer, 0)) - 10) / 2.0)::integer;
  wis_mod := floor((least(30, coalesce((sheet.build #>> '{baseAbilities,wis}')::integer, 10)
    + coalesce((sheet.build #>> '{bonuses,wis}')::integer, 0)) - 10) / 2.0)::integer;
  cha_mod := floor((least(30, coalesce((sheet.build #>> '{baseAbilities,cha}')::integer, 10)
    + coalesce((sheet.build #>> '{bonuses,cha}')::integer, 0)) - 10) / 2.0)::integer;

  class_key := coalesce(sheet.build ->> 'classKey', '');
  subclass_key := coalesce(sheet.build ->> 'subclassKey', '');
  subclass_txt := translate(lower(coalesce(sheet.build ->> 'subclass', '')), 'áéíóúüñàèìòù', 'aeiouunaeiou');
  lvl := coalesce(sheet.level, 1);
  feats := case when jsonb_typeof(sheet.build -> 'features') = 'array' then sheet.build -> 'features' else '[]'::jsonb end;
  rem := case when jsonb_typeof(sheet.build -> 'removed') = 'array' then sheet.build -> 'removed' else '[]'::jsonb end;

  select d.properties into armor from public.inventory_items i join public.item_definitions d
    on d.campaign_id = i.campaign_id and d.id = i.definition_id
   where i.campaign_id = target_campaign and i.character_id = target_character
     and i.equipped_slot = 'body' and d.category = 'armor';

  select d.properties into shield from public.inventory_items i join public.item_definitions d
    on d.campaign_id = i.campaign_id and d.id = i.definition_id
   where i.campaign_id = target_campaign and i.character_id = target_character
     and i.equipped_slot = 'off_hand' and d.category = 'shield';

  has_shield := shield is not null;
  shield_bonus := case when has_shield then coalesce((shield ->> 'acBonus')::integer, 2) else 0 end;

  if armor is not null then
    ac := coalesce((armor ->> 'base')::integer, 10)
      + case when jsonb_typeof(armor -> 'dexCap') = 'number'
          then least(dex_mod, (armor ->> 'dexCap')::integer) else dex_mod end
      + coalesce((armor ->> 'acBonus')::integer, 0)
      + shield_bonus;

    select exists (
      select 1 from jsonb_array_elements(feats) f
      where translate(lower(coalesce(f ->> 'name', '')), 'áéíóúüñàèìòù', 'aeiouunaeiou')
          in ('defense', 'defensa', 'fighting style: defense', 'estilo de combate: defensa')
        or (coalesce(f ->> 'ref', '') in (
              'feature.fighter-fighting-style',
              'feature.paladin-fighting-style',
              'feature.ranger-fighting-style',
              'feature.fighter-champion-additional-fighting-style'
            )
            and translate(lower(coalesce(f ->> 'name', '') || ' ' || coalesce(f ->> 'description', '')),
              'áéíóúüñàèìòù', 'aeiouunaeiou') ~ '\y(defense|defensa)\y')
    ) into defense_ok;
    if defense_ok then ac := ac + 1; end if;
  else
    monk_ok := (not has_shield) and (
      exists (
        select 1 from jsonb_array_elements(feats) f
        where f ->> 'ref' = 'feature.monk-unarmored-defense'
          or (class_key = 'monk'
              and translate(lower(coalesce(f ->> 'name', '')), 'áéíóúüñàèìòù', 'aeiouunaeiou')
                in ('defensa sin armadura', 'unarmored defense'))
      )
      or (class_key = 'monk'
          and not (rem ? 'feature:feature.monk-unarmored-defense' or rem ? 'feature.monk-unarmored-defense'))
    );

    barb_ok := exists (
      select 1 from jsonb_array_elements(feats) f
      where f ->> 'ref' = 'feature.barbarian-unarmored-defense'
        or (class_key = 'barbarian'
            and translate(lower(coalesce(f ->> 'name', '')), 'áéíóúüñàèìòù', 'aeiouunaeiou')
              in ('defensa sin armadura', 'unarmored defense'))
    ) or (class_key = 'barbarian'
          and not (rem ? 'feature:feature.barbarian-unarmored-defense' or rem ? 'feature.barbarian-unarmored-defense'));

    draconic_ok := exists (
      select 1 from jsonb_array_elements(feats) f
      where f ->> 'ref' = 'feature.sorcerer-draconic-draconic-resilience'
        or translate(lower(coalesce(f ->> 'name', '')), 'áéíóúüñàèìòù', 'aeiouunaeiou')
          in ('draconic resilience', 'resiliencia draconica')
    ) or (class_key = 'sorcerer'
          and (subclass_key = 'draconic' or subclass_txt like '%drac%')
          and lvl >= 3
          and not (rem ? 'feature:feature.sorcerer-draconic-draconic-resilience'
                   or rem ? 'feature.sorcerer-draconic-draconic-resilience'));

    base_ac := 10 + dex_mod + shield_bonus;
    ac := greatest(
      base_ac,
      case when monk_ok then 10 + dex_mod + wis_mod else -999 end,
      case when barb_ok then 10 + dex_mod + con_mod + shield_bonus else -999 end,
      case when draconic_ok then 10 + dex_mod + cha_mod + shield_bonus else -999 end
    );
  end if;

  select coalesce(sum((d.properties ->> 'acBonus')::integer), 0) into extra_items
  from public.inventory_items i
  join public.item_definitions d on d.campaign_id = i.campaign_id and d.id = i.definition_id
  where i.campaign_id = target_campaign
    and i.character_id = target_character
    and i.equipped_slot is not null
    and not (i.equipped_slot = 'body' and d.category = 'armor')
    and not (i.equipped_slot = 'off_hand' and d.category = 'shield')
    and jsonb_typeof(d.properties -> 'acBonus') = 'number';

  ac := ac + coalesce(extra_items, 0);

  select (not has_shield)
    and exists (
      select 1 from public.inventory_items i join public.item_definitions d
        on d.campaign_id = i.campaign_id and d.id = i.definition_id
      where i.campaign_id = target_campaign and i.character_id = target_character
        and i.equipped_slot = 'main_hand' and d.category = 'weapon'
        and coalesce((d.properties ->> 'ranged')::boolean, false) = false
    )
    and exists (
      select 1 from public.inventory_items i join public.item_definitions d
        on d.campaign_id = i.campaign_id and d.id = i.definition_id
      where i.campaign_id = target_campaign and i.character_id = target_character
        and i.equipped_slot = 'off_hand' and d.category = 'weapon'
        and coalesce((d.properties ->> 'ranged')::boolean, false) = false
    )
    and exists (
      select 1 from jsonb_array_elements(feats) f
      where translate(lower(coalesce(f ->> 'name', '')), 'áéíóúüñàèìòù', 'aeiouunaeiou')
        in ('dual wielder', 'combatiente con dos armas', 'lucha con dos armas')
    )
    into dual_wield;

  if dual_wield then ac := ac + 1; end if;

  if jsonb_typeof(sheet.build -> 'acBonus') = 'number' then
    ac := ac + (sheet.build ->> 'acBonus')::integer;
  end if;

  ac := greatest(0, least(99, ac));
  -- Derived value: no revision bump, so open sheet edits do not go stale.
  if ac is distinct from sheet.armor_class then
    update public.character_sheets set armor_class = ac
      where campaign_id = target_campaign and character_id = target_character;
  end if;
end;
$fn$;
revoke all on function private.recompute_armor_class(uuid, uuid) from public, anon, authenticated;

create or replace trigger sheets_armor_class after update of build, level on public.character_sheets
  for each row execute function private.sheet_armor_class_follows_equipment();

select count(*) from (
  select private.recompute_armor_class(s.campaign_id, s.character_id)
  from public.character_sheets s
  where s.build -> 'baseAbilities' is not null
) recomputed;
$ddl$;
begin
  execute ddl;
  if to_regprocedure('pre_admin.remap(text)') is not null
      and to_regprocedure('pre_private.recompute_armor_class(uuid,uuid)') is not null
      and to_regclass('pre.character_sheets') is not null then
    execute pre_admin.remap(ddl);
  end if;
end;
$sheetac$;
