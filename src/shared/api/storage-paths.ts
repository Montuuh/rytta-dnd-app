/**
 * RYT-113: a replaced image may only be deleted when its path belongs to the active database
 * environment and to the given campaign (and entity). A PRE copy keeps production paths
 * (`public/...`), and deleting one from a PRE screen would remove the live campaign's image.
 */
export function ownsStoragePath(
  path: string,
  schema: string,
  ...segments: readonly string[]
): boolean {
  if (schema === '' || segments.length === 0 || segments.some((segment) => segment === '')) {
    return false
  }
  return path.startsWith(`${[schema, ...segments].join('/')}/`)
}
