import { defineConfig, presetTypography, presetUno } from 'unocss'

export default defineConfig({
  presets: [presetUno(), presetTypography()],
  theme: {
    colors: {
      cream: '#fffaf6',
      peach: '#ffd9cc',
      mint: '#c8f2e2',
      sky: '#dbeafe',
      ink: '#504a60',
      lilac: '#efe7ff'
    },
    fontFamily: {
      title: '"Baloo 2", "Nunito", sans-serif',
      body: '"Nunito", "Pretendard", "Apple SD Gothic Neo", sans-serif'
    },
    boxShadow: {
      soft: '0 16px 40px rgba(80, 74, 96, 0.12)',
      sticker: '0 8px 0 rgba(80, 74, 96, 0.08)'
    },
    borderRadius: {
      '4xl': '2rem'
    }
  }
})
