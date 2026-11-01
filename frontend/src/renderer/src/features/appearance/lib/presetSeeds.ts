// Sementes dos temas prontos: as escolhas do editor que reproduzem cada um
// (o "Começar de" dos temas próprios). Puro. Ver docs/adr/0040-aparencia-personalizada.md.

import type { ThemeId } from '../../settings/lib/themes'
import { withDefaults, type ColorsV1, type ThemeInput } from './themeInput'

/**
 * As escolhas que reproduzem cada tema pronto (fundos translúcidos já compostos
 * sobre o --bg-app). O teste confere contra o assets/theme.css.
 */
const COLORS: Record<ThemeId, ColorsV1> = {
  'discord-dark': { accent: '#5865f2', background: '#1a1a1e', sidebar: '#121214', card: '#242429', text: '#efeff1', glow: '' },
  'discord-light': { accent: '#5865f2', background: '#ffffff', sidebar: '#fbfbfb', card: '#ffffff', text: '#2e2e34', glow: '' },
  amoled: { accent: '#5865f2', background: '#07080b', sidebar: '#0a0b0e', card: '#111214', text: '#f2f3f5', glow: '#5b21b6' },
  midnight: { accent: '#2563eb', background: '#131c31', sidebar: '#0f172a', card: '#18233b', text: '#e2e8f0', glow: '' },
  forest: { accent: '#1f7a4d', background: '#182b21', sidebar: '#13221a', card: '#1d3428', text: '#e6f2ea', glow: '' },
  sunset: { accent: '#c2410c', background: '#33201c', sidebar: '#2a1a17', card: '#3b2621', text: '#fbeee6', glow: '' },
  neon: { accent: '#9333ea', background: '#180e29', sidebar: '#130a20', card: '#221438', text: '#f3e8ff', glow: '#5b21b6' },
  'high-contrast': { accent: '#1d4ed8', background: '#000000', sidebar: '#000000', card: '#0a0a0a', text: '#ffffff', glow: '' }
}

export const PRESET_SEEDS = Object.fromEntries(
  Object.entries(COLORS).map(([id, colors]) => [id, withDefaults(colors)])
) as Record<ThemeId, ThemeInput>
