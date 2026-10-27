import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/shared/api/database.types'
import { z } from 'zod'
import {
  campaignSchema,
  invitationSchema,
  memberSchema,
  sentInvitationSchema,
  MembershipError,
  createCampaignSchema,
  inviteEmailSchema,
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

export function createSupabaseCampaignRepository(
  client: SupabaseClient<Database>,
): CampaignRepository {
  return {
    async list(signal) {
      let query = client.rpc('list_my_campaigns')
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
  }
}
