import type { CSSProperties } from 'react'

export type TileSize = 'md' | 'lg' | 'fill'

const GLOW = 'ring-2 ring-success shadow-[0_0_24px_rgba(35,165,90,0.25)]'

/** Tamanho fixo do tile; 'fill' ocupa o contêiner (a largura vem de `tileFillStyle`). */
export function tileDims(size: TileSize): string {
  if (size === 'fill') return 'max-h-full max-w-full'
  return size === 'lg' ? 'h-48 w-80' : 'h-28 w-44'
}

/**
 * 'fill': o maior retângulo com a proporção do vídeo que cabe no container
 * (o pai precisa ter container-type: size).
 */
export function tileFillStyle(size: TileSize, aspect: number): CSSProperties | undefined {
  if (size !== 'fill') return undefined
  return { aspectRatio: String(aspect), width: `min(100cqw, calc(100cqh * ${aspect}))` }
}

/** Destaque verde: transmissão, ou quem fala / toca som. */
export function tileRing(isScreen: boolean, active: boolean): string {
  return isScreen || active ? GLOW : 'ring-1 ring-fg/6'
}

export function tileFrameClass(opts: {
  size: TileSize
  inFullscreen: boolean
  isScreen: boolean
  active: boolean
  clickable: boolean
}): string {
  const { size, inFullscreen, isScreen, active, clickable } = opts
  if (inFullscreen) return 'bg-black'
  const cursor = clickable ? 'cursor-pointer hover:brightness-110' : ''
  return `rounded-2xl bg-white/[0.04] ${tileDims(size)} ${tileRing(isScreen, active)} ${cursor}`
}

/** Atributos do contêiner: botão se clicável, dica de expandir a tela, marca do Maestro. */
export function tileRootAttrs(
  clickable: boolean,
  isScreen: boolean,
  maestro: boolean
): { role?: string; title?: string; 'data-maestro-tile'?: string } {
  return {
    role: clickable ? 'button' : undefined,
    title: clickable && isScreen ? 'Expandir tela' : undefined,
    'data-maestro-tile': maestro ? '' : undefined
  }
}
