import type { Json } from './database.generated'
// Reviewed SQL contract for the RYT-007 combat migration. Results are JSON validated by the
// combat adapter; regenerate from local Supabase when the stack is available.
type Call<A> = { Args: A & { target_campaign: string }; Returns: Json }
type Mutation<A> = Call<A & { request_id: string }>
export type CombatFunctions = {
  list_encounters: Call<object>
  get_combat_state: Call<{ target_encounter: string | null; as_table: boolean }>
  list_combatant_templates: Call<object>
  create_encounter: Mutation<{ encounter_name: string }>
  rename_encounter: Mutation<{ target_encounter: string; encounter_name: string }>
  delete_encounter: Call<{ target_encounter: string }>
  set_encounter_status: Mutation<{ target_encounter: string; new_status: string }>
  add_combatants: Mutation<{ target_encounter: string; entries: Json }>
  update_combatant: Mutation<{ target_combatant: string; patch: Json }>
  remove_combatant: Mutation<{ target_combatant: string }>
  set_initiative: Mutation<{
    target_combatant: string
    initiative_total: number
    tiebreak_bonus: number | null
  }>
  roll_npc_initiative: Mutation<{ target_encounter: string }>
  set_turn_order: Mutation<{ target_encounter: string; ordered_ids: string[] }>
  advance_turn: Mutation<{
    target_encounter: string
    direction: number
    expected_active: string | null
  }>
  set_active_turn: Mutation<{
    target_encounter: string
    target_combatant: string
    expected_active: string | null
  }>
  apply_combat_hp: Mutation<{ target_encounter: string; hp_mode: string; hits: Json }>
  set_combat_condition: Mutation<{
    target_combatant: string
    condition_key: string
    enabled: boolean
  }>
  set_concentration: Mutation<{ target_combatant: string; spell: string | null }>
  record_death_save: Mutation<{ target_combatant: string; outcome: string }>
  add_combat_effect: Mutation<{ target_encounter: string; effect: Json }>
  remove_combat_effect: Mutation<{ target_effect: string }>
  undo_combat_event: Mutation<{ target_event: string }>
  save_combatant_template: Mutation<{
    target_template: string | null
    expected_revision: number | null
    data: Json
  }>
  delete_combatant_template: Call<{ target_template: string }>
  set_combatant_template_image: Mutation<{
    target_template: string
    expected_revision: number
    new_path: string | null
  }>
}
