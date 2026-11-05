import type { ServerPlugin } from '../api/plugins'

/** Quantos ícones de plugins ligados cabem na barra, ao lado do quebra-cabeça. */
export const MAX_HEADER_ICONS = 2

/** Os plugins ligados, na ordem recebida, cortados nos que cabem na barra. */
export function headerPlugins(list: ServerPlugin[]): ServerPlugin[] {
  return list.filter((p) => p.enabled).slice(0, MAX_HEADER_ICONS)
}
