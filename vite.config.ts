import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { fileURLToPath, URL } from 'node:url'
import { parseConfig } from './src/shared/lib/env-schema.ts'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  // Reject unsafe credentials before Vite can inline them into a public bundle.
  parseConfig(env)
  return {
    plugins: [react()],
    base: env.VITE_BASE_PATH || '/',
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  }
})
