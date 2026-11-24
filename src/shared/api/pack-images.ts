import { z } from 'zod'
import { config } from '@/shared/lib/config'
import { newRequestId } from '@/shared/lib/request-id'
import { uploadExtension, uploadTypes } from '@/shared/lib/image-encode'
import { createBatchSigner } from './batch-sign'

/**
 * RYT-172 (ADR 053): pictures of content library entries, in the private `pack-images` bucket at
 * `<env>/<pack id>/<uuid>.<ext>`. An entry names its picture in `data.index.image`; it is published
 * with the pack version. Content editors upload; readers sign through the bucket's read policy.
 */
export const packImageBucket = 'pack-images'
/** The bucket's limit: a cropped 1024 px WebP is far below it. */
export const packImageBytes = 2_097_152
const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const pathPattern = new RegExp(`^(public|pre)/${uuid}/${uuid}[.](webp|png|jpg)$`)
export const isPackImagePath = (value: unknown): value is string =>
  typeof value === 'string' && pathPattern.test(value)

async function client() {
  if (config.VITE_DATA_MODE !== 'supabase') throw new Error('unavailable')
  const { getSupabase } = await import('@/shared/api/supabase')
  return getSupabase(config.VITE_SUPABASE_URL!, config.VITE_SUPABASE_PUBLISHABLE_KEY!)
}

/** Signed pack pictures stay valid this long; the cache re-signs them well before expiry. */
const ttlSeconds = 3600
const sign = createBatchSigner(client, packImageBucket, ttlSeconds)

/** Signs one pack picture of the environment the app runs against. */
export async function packImageUrl(path: string) {
  const { activeSchema } = await import('@/shared/api/supabase')
  if (!isPackImagePath(path) || !path.startsWith(`${activeSchema()}/`))
    throw new Error('unavailable')
  return sign(path)
}

/** Uploads a picture for a pack entry; the entry names it when its draft is saved. */
export async function uploadPackImage(packId: string, image: Blob) {
  if (!(uploadTypes as readonly string[]).includes(image.type) || image.size > packImageBytes)
    throw new Error('invalid')
  const db = await client()
  const { activeSchema } = await import('@/shared/api/supabase')
  const path = `${activeSchema()}/${z.uuid().parse(packId)}/${newRequestId()}.${uploadExtension(image.type)}`
  const result = await db.storage
    .from(packImageBucket)
    .upload(path, image, { contentType: image.type })
  if (result.error) throw new Error('unavailable')
  return path
}

const imageSchema = z.object({
  kind: z.enum(['creature', 'item', 'class', 'subclass']),
  id: z.string().max(90),
  path: z.string().refine(isPackImagePath),
})
const rowsSchema = z.array(z.unknown()).max(3000)

/** A campaign's pack pictures by kind and app id (`<key>` for the SRD, `<ref>--<key>` otherwise). */
export type PackImages = {
  creature: ReadonlyMap<string, string>
  item: ReadonlyMap<string, string>
  class: ReadonlyMap<string, string>
}
export const noPackImages: PackImages = { creature: new Map(), item: new Map(), class: new Map() }

export async function loadCampaignPackImages(
  campaignId: string,
  signal?: AbortSignal,
): Promise<PackImages> {
  const db = await client()
  let call = db.rpc('get_campaign_pack_images', { target_campaign: z.uuid().parse(campaignId) })
  if (signal) call = call.abortSignal(signal)
  const result = await call
  if (result.error) throw new Error('unavailable')
  const images = {
    creature: new Map<string, string>(),
    item: new Map<string, string>(),
    class: new Map<string, string>(),
  }
  // A row that does not read is skipped alone: the rest of the campaign keeps its pictures.
  for (const value of rowsSchema.parse(result.data)) {
    const row = imageSchema.safeParse(value)
    if (row.success)
      images[row.data.kind === 'subclass' ? 'class' : row.data.kind].set(row.data.id, row.data.path)
  }
  return images
}

/** Query options (TanStack shape) shared by the features that show pack pictures. */
export const campaignPackImagesOptions = (
  userId: string | undefined,
  campaignId: string | undefined,
) => ({
  queryKey: ['private', userId, 'campaign', campaignId, 'pack-images'] as const,
  queryFn: ({ signal }: { signal: AbortSignal }) => loadCampaignPackImages(campaignId!, signal),
  enabled: config.VITE_DATA_MODE === 'supabase' && Boolean(userId && campaignId),
  staleTime: 5 * 60_000,
})
const refreshMs = (ttlSeconds - 600) * 1000
export const packImageOptions = (userId: string | undefined, path: string | null | undefined) => ({
  queryKey: ['private', userId, 'pack-image', path] as const,
  queryFn: () => packImageUrl(path!),
  enabled: Boolean(userId && path),
  staleTime: refreshMs,
  refetchInterval: refreshMs,
  retry: false,
})
