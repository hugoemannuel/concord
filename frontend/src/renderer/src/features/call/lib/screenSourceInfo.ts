import type { ScreenSourceInfo } from './screenStats'

// A fonte da minha live para a telemetria (docs/adr/0074): o tamanho antes de
// reduzir (o que rememberScreenSource guardou) e o tipo de superfície. Só o
// tipo: o título da janela e o id da tela nunca saem daqui. Puro.

const SURFACES = new Set(['monitor', 'window', 'browser'])

export function screenSourceInfo(settings: MediaTrackSettings): ScreenSourceInfo {
  const surface = (settings as { displaySurface?: string }).displaySurface
  return {
    width: settings.width ?? null,
    height: settings.height ?? null,
    surface: surface && SURFACES.has(surface) ? surface : null
  }
}
