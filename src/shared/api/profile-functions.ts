// Reviewed SQL contract for the RYT-078 username migration (ADR 036); regenerate from local
// Supabase when the stack is available.
export type ProfileFunctions = {
  get_my_username: { Args: Record<string, never>; Returns: string | null }
  username_available: { Args: { candidate: string }; Returns: boolean }
  set_my_username: { Args: { new_username: string }; Returns: string }
}
