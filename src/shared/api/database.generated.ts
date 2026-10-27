export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '14.18'
  }
  public: {
    Tables: {
      campaign_invitations: {
        Row: {
          campaign_id: string
          created_at: string
          created_by: string
          email: string
          expires_at: string
          id: string
          responded_by: string | null
          status: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          created_by: string
          email: string
          expires_at?: string
          id?: string
          responded_by?: string | null
          status?: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          created_by?: string
          email?: string
          expires_at?: string
          id?: string
          responded_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: 'campaign_invitations_campaign_id_fkey'
            columns: ['campaign_id']
            isOneToOne: false
            referencedRelation: 'campaigns'
            referencedColumns: ['id']
          },
        ]
      }
      campaign_members: {
        Row: {
          active: boolean
          campaign_id: string
          joined_at: string
          role: string
          user_id: string
        }
        Insert: {
          active?: boolean
          campaign_id: string
          joined_at?: string
          role: string
          user_id: string
        }
        Update: {
          active?: boolean
          campaign_id?: string
          joined_at?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'campaign_members_campaign_id_fkey'
            columns: ['campaign_id']
            isOneToOne: false
            referencedRelation: 'campaigns'
            referencedColumns: ['id']
          },
        ]
      }
      campaigns: {
        Row: {
          created_at: string
          description: string
          id: string
          name: string
          owner_id: string
        }
        Insert: {
          created_at?: string
          description?: string
          id?: string
          name: string
          owner_id: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          name?: string
          owner_id?: string
        }
        Relationships: []
      }
      character_resources: {
        Row: {
          campaign_id: string
          character_id: string
          copper: number
          exhaustion: number
          rations: number
          revision: number
          water_units: number
        }
        Insert: {
          campaign_id: string
          character_id: string
          copper?: number
          exhaustion?: number
          rations?: number
          revision?: number
          water_units?: number
        }
        Update: {
          campaign_id?: string
          character_id?: string
          copper?: number
          exhaustion?: number
          rations?: number
          revision?: number
          water_units?: number
        }
        Relationships: [
          {
            foreignKeyName: 'character_resources_campaign_id_character_id_fkey'
            columns: ['campaign_id', 'character_id']
            isOneToOne: false
            referencedRelation: 'characters'
            referencedColumns: ['campaign_id', 'id']
          },
        ]
      }
      characters: {
        Row: {
          campaign_id: string
          created_at: string
          id: string
          name: string
          user_id: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          id?: string
          name: string
          user_id: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'characters_campaign_id_fkey'
            columns: ['campaign_id']
            isOneToOne: false
            referencedRelation: 'campaigns'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'characters_campaign_id_user_id_fkey'
            columns: ['campaign_id', 'user_id']
            isOneToOne: false
            referencedRelation: 'campaign_members'
            referencedColumns: ['campaign_id', 'user_id']
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      change_campaign_member: {
        Args: { new_role: string; target_campaign: string; target_user: string }
        Returns: undefined
      }
      create_campaign: {
        Args: { campaign_description?: string; campaign_name: string }
        Returns: string
      }
      invite_campaign_member: {
        Args: { invite_email: string; target_campaign: string }
        Returns: string
      }
      list_campaign_members: {
        Args: { target_campaign: string }
        Returns: {
          display_name: string
          email: string
          role: string
          user_id: string
        }[]
      }
      list_my_campaigns: {
        Args: never
        Returns: {
          created_at: string
          description: string
          id: string
          name: string
          role: string
        }[]
      }
      list_my_invitations: {
        Args: never
        Returns: {
          campaign_id: string
          campaign_name: string
          email: string
          expires_at: string
          id: string
        }[]
      }
      respond_campaign_invitation: {
        Args: { accept_invitation: boolean; invitation_id: string }
        Returns: string
      }
      revoke_campaign_invitation: {
        Args: { invitation_id: string }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
