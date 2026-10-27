import { z } from 'zod'

const schema = z
  .object({
    VITE_DATA_MODE: z.enum(['demo', 'supabase']).default('demo'),
    VITE_SUPABASE_URL: z.url().optional(),
    VITE_SUPABASE_PUBLISHABLE_KEY: z.string().min(1).optional(),
  })
  .superRefine((value, context) => {
    if (
      value.VITE_DATA_MODE === 'supabase' &&
      (!value.VITE_SUPABASE_URL || !value.VITE_SUPABASE_PUBLISHABLE_KEY)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Supabase mode requires a URL and publishable key.',
      })
    }
    if (
      value.VITE_SUPABASE_PUBLISHABLE_KEY &&
      !value.VITE_SUPABASE_PUBLISHABLE_KEY.startsWith('sb_publishable_')
    ) {
      context.addIssue({
        code: 'custom',
        message:
          'Use a modern public publishable key. Legacy JWT and secret keys are not accepted.',
      })
    }
  })

export function parseConfig(input: Record<string, unknown>) {
  const normalized = Object.fromEntries(
    Object.entries(input).map(([key, value]) => [key, value === '' ? undefined : value]),
  )
  const result = schema.safeParse(normalized)
  if (!result.success)
    throw new Error(
      'Invalid app configuration. Check .env.example; never use a server secret in VITE_ variables.',
    )
  return result.data
}
