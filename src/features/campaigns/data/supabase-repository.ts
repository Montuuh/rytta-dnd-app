import type { AppSupabaseClient } from '@/shared/api/database.types'
import { z } from 'zod'
import {
  auditEventSchema,
  campaignSchema,
  createCampaignSchema,
  createRevelationSchema,
  invitationSchema,
  inviteEmailSchema,
  memberSchema,
  MembershipError,
  revelationSchema,
  revelationVisibilitySchema,
  sentInvitationSchema,
  type CampaignRepository,
} from '../domain/campaign'

function check(error: { message: string } | null) {
  if (!error) return
  throw new MembershipError(
    error.message.includes('Keep at least one DM')
      ? 'last-dm'
      : error.message.includes('Already a member')
        ? 'already-member'
        : 'unavailable',
  )
}

export function createSupabaseCampaignRepository(client: AppSupabaseClient): CampaignRepository {
  return {
    async list(signal) {
      let query = client.rpc('list_my_campaigns_with_modules')
      if (signal) query = query.abortSignal(signal)
      const { data, error } = await query
      check(error)
      return campaignSchema.array().parse(data)
    },
    async invitations(signal) {
      let query = client.rpc('list_my_invitations')
      if (signal) query = query.abortSignal(signal)
      const { data, error } = await query
      check(error)
      return invitationSchema.array().parse(data)
    },
    async members(campaignId, signal) {
      let query = client.rpc('list_campaign_members', { target_campaign: campaignId })
      if (signal) query = query.abortSignal(signal)
      const { data, error } = await query
      check(error)
      return memberSchema.array().parse(data)
    },
    async sentInvitations(campaignId, signal) {
      let query = client
        .from('campaign_invitations')
        .select('id, email, expires_at')
        .eq('campaign_id', campaignId)
        .eq('status', 'pending')
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
      if (signal) query = query.abortSignal(signal)
      const { data, error } = await query
      check(error)
      return sentInvitationSchema.array().parse(data)
    },
    async revelations(campaignId, signal) {
      let query = client
        .from('campaign_revelations')
        .select('id, campaign_id, title, category, summary, visibility, created_at, updated_at')
        .eq('campaign_id', campaignId)
        .order('created_at', { ascending: false })
      if (signal) query = query.abortSignal(signal)
      const { data, error } = await query
      check(error)
      return revelationSchema.array().parse(data)
    },
    async auditEvents(campaignId, signal) {
      let query = client
        .from('character_events')
        .select(
          'id, campaign_id, character_id, actor_id, kind, before_value, after_value, created_at',
        )
        .eq('campaign_id', campaignId)
        .order('created_at', { ascending: false })
        .limit(40)
      if (signal) query = query.abortSignal(signal)
      const { data, error } = await query
      check(error)
      return auditEventSchema.array().parse(data)
    },
    async create(name, description) {
      const values = createCampaignSchema.parse({ name, description })
      const { data, error } = await client.rpc('create_campaign', {
        campaign_name: values.name,
        campaign_description: values.description,
      })
      check(error)
      return z.uuid().parse(data)
    },
    async invite(campaignId, email) {
      const { data, error } = await client.rpc('invite_campaign_member', {
        target_campaign: z.uuid().parse(campaignId),
        invite_email: inviteEmailSchema.parse(email.trim().toLowerCase()),
      })
      check(error)
      return z.uuid().parse(data)
    },
    async respond(invitationId, accept) {
      const { data, error } = await client.rpc('respond_campaign_invitation', {
        invitation_id: invitationId,
        accept_invitation: accept,
      })
      check(error)
      return z.uuid().parse(data)
    },
    async revoke(invitationId) {
      const { error } = await client.rpc('revoke_campaign_invitation', {
        invitation_id: invitationId,
      })
      check(error)
    },
    async changeMember(campaignId, userId, role) {
      const { error } = await client.rpc('change_campaign_member', {
        target_campaign: campaignId,
        target_user: userId,
        new_role: role,
      })
      check(error)
    },
    async setModules(campaignId, modules) {
      const { data, error } = await client.rpc('set_campaign_modules', {
        target_campaign: z.uuid().parse(campaignId),
        modules: z.array(z.string()).parse(modules),
      })
      check(error)
      return z.array(z.string()).parse(data)
    },
    async createRevelation(campaignId, input) {
      const parsed = createRevelationSchema.parse(input)
      const { data, error } = await client.rpc('create_campaign_revelation', {
        target_campaign: z.uuid().parse(campaignId),
        item_title: parsed.title,
        item_category: parsed.category,
        item_summary: parsed.summary,
        item_visibility: parsed.visibility,
      })
      check(error)
      return z.uuid().parse(data)
    },
    async setRevelationVisibility(campaignId, revelationId, visibility) {
      const { error } = await client.rpc('set_revelation_visibility', {
        target_campaign: z.uuid().parse(campaignId),
        target_revelation: z.uuid().parse(revelationId),
        new_visibility: revelationVisibilitySchema.parse(visibility),
      })
      check(error)
    },
  }
}
