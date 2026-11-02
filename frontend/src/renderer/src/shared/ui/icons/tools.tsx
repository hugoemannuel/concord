// Ferramentas da tela compartilhada (desenho) e do fundo da câmera.
import { BoltIcon } from './effects'
import { Icon, type IconProps } from './Icon'

/** Marca-texto inclinado. */
export function HighlighterIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <g transform="rotate(45 12 12)">
        <rect x="9" y="0.5" width="6" height="11.5" rx="1.75" />
        <path d="M9.25 13h5.5v2.5l-1.5 1.5h-2.5l-1.5-1.5z" />
        <path d="M10.75 18h2.5l-.5 3.5h-1.5z" />
      </g>
    </Icon>
  )
}

/** Laser (risco que some): o mesmo raio. */
export const LaserIcon = BoltIcon

/** Borracha inclinada sobre a linha. */
export function EraserIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <g transform="rotate(-45 11 11)">
        <rect x="3" y="7" width="7" height="8" rx="2" />
        <path d="M11 7h7a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-7z" />
      </g>
      <rect x="11" y="20" width="11" height="2" rx="1" />
    </Icon>
  )
}

/** Pessoa com o fundo desfocado. */
export function BlurIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <circle cx="12" cy="8.5" r="3.75" />
      <path d="M4.5 20.5c0-4.1 3.3-7 7.5-7s7.5 2.9 7.5 7a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1z" />
      <g opacity=".55">
        <circle cx="3.5" cy="5" r="1.25" />
        <circle cx="3.5" cy="10" r="1" />
        <circle cx="20.5" cy="5" r="1.25" />
        <circle cx="20.5" cy="10" r="1" />
      </g>
    </Icon>
  )
}

/** Imagem com "+": enviar uma imagem. */
export function ImageAddIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path
        fillRule="evenodd"
        d="M5 7h9.5a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3v-9a3 3 0 0 1 3-3zm2.5 3a1.75 1.75 0 1 0 0 3.5 1.75 1.75 0 0 0 0-3.5zM4.5 19.5h10.5l-3.5-5-2.5 3-1.5-1.5z"
      />
      <path d="M19.5 1a1 1 0 0 1 1 1v2h2a1 1 0 1 1 0 2h-2v2a1 1 0 1 1-2 0V6h-2a1 1 0 1 1 0-2h2V2a1 1 0 0 1 1-1z" />
    </Icon>
  )
}

/** Peça de quebra-cabeça: plugins. */
export function PuzzleIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="M10 2.5A2.5 2.5 0 0 1 12.5 5v1H17a2 2 0 0 1 2 2v3.5h-1a2.5 2.5 0 0 0 0 5h1V19a2 2 0 0 1-2 2h-3.5v-1a2.5 2.5 0 0 0-5 0v1H5a2 2 0 0 1-2-2v-4.5h1a2.5 2.5 0 0 0 0-5H3V8a2 2 0 0 1 2-2h3.5V5A2.5 2.5 0 0 1 10 2.5z" />
    </Icon>
  )
}
