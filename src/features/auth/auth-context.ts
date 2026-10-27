import { createContext, useContext } from 'react'
import type { AuthController, AuthSnapshot } from './domain/auth'
export const AuthContext = createContext<{
  state: AuthSnapshot
  controller: AuthController | null
} | null>(null)
export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('AuthProvider is required')
  return value
}
