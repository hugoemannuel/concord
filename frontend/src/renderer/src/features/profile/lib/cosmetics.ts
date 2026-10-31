import { profileMediaSrc } from './profileMedia'

// Faixa (imagem atrás do nome nas listas) e moldura do avatar (#482). Os modos
// são os do backend (internal/cosmetics); cosmetics.test.ts confere a lista.

export const NAMEPLATE_MODES = ['off', 'banner', 'custom'] as const
export type NameplateMode = (typeof NAMEPLATE_MODES)[number]

/** Modo seguro: desconhecido vira "off" (sem faixa). */
export function resolveNameplateMode(raw: unknown): NameplateMode {
  return NAMEPLATE_MODES.find((m) => m === raw) ?? 'off'
}

/** A moldura é maior que o avatar, como a decoração do Discord. */
export const DECORATION_SCALE = 1.2

/** Lado da moldura e o deslocamento que a centraliza sobre o avatar. */
export function decorationBox(size: number): { side: number; offset: number } {
  const side = Math.round(size * DECORATION_SCALE)
  return { side, offset: -Math.round((side - size) / 2) }
}

export type MediaAnimate = 'always' | 'hover' | 'never'

/**
 * As camadas de uma faixa/moldura. Nas listas só o quadro parado é baixado;
 * o GIF entra (`moving`) só com a linha ativa (hover/foco) e sai depois, para
 * a lista de um servidor cheio não baixar GIF nenhum.
 */
export function mediaLayers(
  url: string | null | undefined,
  apiBase: string,
  { animate, active }: { animate: MediaAnimate; active: boolean }
): { still: string | null; moving: string | null } {
  const still = profileMediaSrc(url, apiBase, { animate: animate === 'always' })
  const animated = still !== null && profileMediaSrc(url, apiBase) !== still
  const moving = animated && animate === 'hover' && active ? profileMediaSrc(url, apiBase) : null
  return { still, moving }
}
