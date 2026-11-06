import type { CSSProperties } from 'react'
import { serverIconSrc } from '../../features/servers/lib/serverIcon'

type ServerIconSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'fill'
type ServerIconText = 'xxs' | 'xs' | 'sm' | 'md' | 'lg'
type ServerIconShape = 'md' | 'xl' | 'full'

/** Lado da caixa e o texto da inicial que combina com ele. */
const SIZE: Record<ServerIconSize, { box: string; text?: ServerIconText }> = {
  xs: { box: 'size-4', text: 'xxs' },
  sm: { box: 'size-5', text: 'xxs' },
  md: { box: 'size-8', text: 'xs' },
  lg: { box: 'size-10', text: 'md' },
  xl: { box: 'size-16', text: 'lg' },
  fill: { box: 'size-full' }
}

const TEXT: Record<ServerIconText, string> = {
  xxs: 'text-ds-xxs',
  xs: 'text-ds-xs',
  sm: 'text-ds-sm',
  md: 'text-ds-md',
  lg: 'text-ds-lg'
}

const SHAPE: Record<ServerIconShape, string> = {
  md: 'rounded-md',
  xl: 'rounded-xl',
  full: 'rounded-full'
}

const PINNED = 'pointer-events-none select-none'

export interface ServerIconProps {
  name: string
  iconUrl?: string | null
  /** xs 16, sm 20, md 32 (padrão), lg 40, xl 64 px; fill ocupa o pai (texto herdado); número = lado em px (o texto fica com o chamador). */
  size?: ServerIconSize | number
  /** Raio da escala: md (padrão), xl, full. */
  shape?: ServerIconShape
  /** Troca o texto da inicial que vem com o tamanho. */
  text?: ServerIconText
  /** Fundo, peso e cor da caixa, com ou sem imagem. */
  className?: string
  /** Só sem imagem: o fundo e a cor da inicial. */
  fallbackClassName?: string
  style?: CSSProperties
  /** Trilho de servidores: a imagem não arrasta e nada pega o ponteiro (o botão pai cuida). */
  pinned?: boolean
  /** Listas longas: a imagem carrega e decodifica sem travar. */
  lazy?: boolean
}

function boxClasses(size: ServerIconSize | number, shape: ServerIconShape, text?: ServerIconText): string {
  const preset = typeof size === 'number' ? null : SIZE[size]
  const textClass = text ?? preset?.text
  return [preset?.box, textClass && TEXT[textClass], SHAPE[shape]].filter(Boolean).join(' ')
}

/** Ícone do servidor (foto/GIF) ou, sem ele, a inicial do nome. Um desenho só no app inteiro. */
export default function ServerIcon({
  name,
  iconUrl,
  size = 'md',
  shape = 'md',
  text,
  className = '',
  fallbackClassName = 'bg-fg/10 font-semibold text-normal',
  style,
  pinned = false,
  lazy = false
}: ServerIconProps): React.JSX.Element {
  const src = serverIconSrc(iconUrl)
  const px = typeof size === 'number' ? { width: size, height: size } : undefined
  const tone = src ? '' : fallbackClassName
  const box = `flex shrink-0 items-center justify-center overflow-hidden ${boxClasses(size, shape, text)} ${tone} ${className}`
  return (
    <span className={box.replace(/\s+/g, ' ').trim()} style={px || style ? { ...px, ...style } : undefined}>
      {src ? (
        <img
          src={src}
          alt=""
          loading={lazy ? 'lazy' : undefined}
          decoding={lazy ? 'async' : undefined}
          draggable={pinned ? false : undefined}
          className={`h-full w-full object-cover ${pinned ? PINNED : ''}`.trim()}
        />
      ) : (
        <span aria-hidden="true" className={pinned ? PINNED : undefined}>
          {name.charAt(0).toUpperCase()}
        </span>
      )}
    </span>
  )
}
