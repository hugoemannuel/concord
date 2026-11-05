// O fundo do servidor no gerador de tema do app (features/appearance): um ponto
// de partida pronto e/ou uma imagem. Puro.

import { PRESET_SEEDS } from '../../appearance/lib/presetSeeds'
import { STARTERS } from '../../appearance/lib/starters'
import type { ThemeInput } from '../../appearance/lib/themeInput'
import type { ServerTheme } from '../api/serverProfile'

/** O tema a mostrar enquanto a pessoa está no servidor; null = o dela. */
export function serverThemeInput(theme: ServerTheme | undefined): ThemeInput | null {
  if (!theme) return null
  const starter = STARTERS.find((s) => s.id === theme.starter)?.input
  if (!starter && !theme.image) return null
  const base = starter ?? PRESET_SEEDS['discord-dark']
  return theme.image ? { ...base, image: theme.image, imageDim: theme.dim } : base
}
