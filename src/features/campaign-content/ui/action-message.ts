/** The sentence for a failed content action, by the code the adapter throws. */
export const actionMessage = (code: string) =>
  code === 'stale'
    ? ('campaignContent.stale' as const)
    : code === 'forbidden'
      ? ('campaignContent.forbidden' as const)
      : code === 'invalid'
        ? ('campaignContent.invalid' as const)
        : ('campaignContent.actionError' as const)
