// No editable environment variable can point localhost/dev at production tables.
// A production bundle served locally also uses PRE; public deployments always use public.
export function databaseSchema({
  development,
  hostname,
}: {
  development: boolean
  hostname: string
}): 'pre' | 'public' {
  const loopback = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(hostname.toLowerCase())
  return development || loopback ? 'pre' : 'public'
}
