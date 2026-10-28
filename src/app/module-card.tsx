import { Paper } from '@mantine/core'
import { Link } from 'react-router'
import type { PropsWithChildren } from 'react'
export function ModuleCard({
  to,
  enabled,
  children,
}: PropsWithChildren<{ to: string; enabled: boolean }>) {
  return enabled ? (
    <Paper component={Link} to={to} p="lg" className="module-card">
      {children}
    </Paper>
  ) : (
    <Paper p="lg" className="module-card disabled-module" aria-disabled="true">
      {children}
    </Paper>
  )
}
