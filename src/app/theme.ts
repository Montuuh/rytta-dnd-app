import { createTheme, defaultVariantColorsResolver } from '@mantine/core'

export const theme = createTheme({
  primaryColor: 'forest',
  colors: {
    dark: [
      '#f5ebd6',
      '#e5d5bc',
      '#cbb699',
      '#a88f70',
      '#4d3828',
      '#3a2a1e',
      '#2a1f16',
      '#1e1610',
      '#140f0b',
      '#0c0906',
    ],
    forest: [
      '#fdf5e8',
      '#faead1',
      '#f6c478',
      '#eda145',
      '#d9822b',
      '#bf6919',
      '#9e5114',
      '#844112',
      '#6e3410',
      '#57280b',
    ],
  },
  primaryShade: { light: 8, dark: 3 },
  autoContrast: true,
  variantColorResolver: (input) => {
    const colors = defaultVariantColorsResolver(input)
    return input.variant === 'filled' && input.color === 'forest'
      ? { ...colors, color: 'var(--app-on-accent)' }
      : colors
  },
  fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
  headings: { fontFamily: 'Georgia, Cambria, serif', fontWeight: '500' },
  defaultRadius: 'md',
  cursorType: 'pointer',
  components: {
    Badge: { defaultProps: { color: 'forest' } },
    Button: { defaultProps: { size: 'md' }, styles: { root: { minHeight: 44 } } },
    NativeSelect: { styles: { input: { minHeight: 44 } } },
    SegmentedControl: {
      styles: {
        label: { minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' },
      },
    },
    Paper: { defaultProps: { withBorder: true } },
  },
})
