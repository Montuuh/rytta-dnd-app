import { config } from '@/shared/lib/config'

/** RYT-157: whether a bot check guards the email forms (the hosted Auth settings require it). */
export const captchaEnabled = Boolean(config.VITE_TURNSTILE_SITE_KEY)
