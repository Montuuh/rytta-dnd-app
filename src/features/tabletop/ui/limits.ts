/** RYT-113: the specific words for a refused upload or scene creation, or null for anything else. */
export function limitKey(
  error: unknown,
): 'common.storageQuota' | 'tabletop.error.sceneLimit' | null {
  const code = error instanceof Error ? error.message : ''
  return code === 'storageQuota'
    ? 'common.storageQuota'
    : code === 'sceneLimit'
      ? 'tabletop.error.sceneLimit'
      : null
}
