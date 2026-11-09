export const creationModes = ['quick', 'full', 'blank'] as const
export type CreationMode = (typeof creationModes)[number]
export const isCreationMode = (value: string | null): value is CreationMode =>
  (creationModes as readonly string[]).includes(value ?? '')
