import { createContext, useContext } from 'react'
import type { ConnectionPhase } from './connection'

/** RYT-013: the app-wide connection phase, so a screen does not repeat what the line says. */
export const ConnectionContext = createContext<ConnectionPhase>('live')
export const useConnectionPhase = () => useContext(ConnectionContext)
