import type { Json } from './database.generated'
// Reviewed SQL contract for the RYT-055 tabletop migration (ADR 032). Results are JSON validated by
// the tabletop adapter; regenerate from local Supabase when the stack is available.
type Call<A> = { Args: A & { target_campaign: string }; Returns: Json }
type Mutation<A> = Call<A & { request_id: string }>
export type TabletopFunctions = {
  get_tabletop: Call<{ target_scene: string | null; as_table: boolean }>
  list_tabletop_scenes: Call<object>
  get_tabletop_library: Call<object>
  save_tabletop_scene: Mutation<{
    target_scene: string | null
    fields: Json
    expected_revision: number | null
  }>
  delete_tabletop_scene: Mutation<{ target_scene: string }>
  put_tabletop_items: Mutation<{ target_scene: string; items: Json }>
  delete_tabletop_items: Mutation<{ target_scene: string; ids: string[] }>
  change_tabletop_fog: Mutation<{ target_scene: string; op: Json }>
  set_tabletop_live: Mutation<{ patch: Json }>
  save_tabletop_card: Mutation<{ target_card: string | null; fields: Json }>
  delete_tabletop_card: Mutation<{ target_card: string }>
  add_tabletop_track: Mutation<{
    title: string
    track_path: string
    mime: string
    size_bytes: number
  }>
  delete_tabletop_track: Mutation<{ target_track: string }>
  fire_tabletop_event: Mutation<{ target_item: string; reset: boolean }>
}
