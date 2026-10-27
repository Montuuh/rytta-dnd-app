import { parseConfig } from './env-schema'
export const config = parseConfig(import.meta.env)
