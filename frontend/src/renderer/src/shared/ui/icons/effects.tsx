// Efeitos do perfil (neve, fogo, raio...) e os brilhos de "novidades".
import { Icon, type IconProps } from './Icon'

/** Traço dos efeitos que são linha por natureza (floco, onda, espiral, grade). */
const STROKE = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round'
} as const

/** Brilho de 4 pontas, grande e pequeno. */
export function SparkleIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="M10 3q1 7 8 8-7 1-8 8-1-7-8-8 7-1 8-8z" />
      <path d="M18.5 1q.5 3 3.5 3.5-3 .5-3.5 3.5-.5-3-3.5-3.5 3-.5 3.5-3.5z" />
    </Icon>
  )
}

/** Novidades (changelog): os mesmos brilhos. */
export const ChangelogIcon = SparkleIcon

export function SnowIcon(props: IconProps): React.JSX.Element {
  const arm = 'M12 2v20M9 3.5l3 2.5 3-2.5M9 20.5l3-2.5 3 2.5'
  return (
    <Icon {...props}>
      <g {...STROKE}>
        <path d={arm} />
        <path d={arm} transform="rotate(60 12 12)" />
        <path d={arm} transform="rotate(120 12 12)" />
      </g>
    </Icon>
  )
}

/** Chama com o miolo vazado. */
export function FlameIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path
        fillRule="evenodd"
        d="M12 1.5c.4 3 2.3 4.7 4 6.5 1.6 1.7 3 3.6 3 6.5a7 7 0 0 1-14 0c0-2.7 1.2-4.6 2.6-6 .3 1.8 1.1 3 2.4 3.6C10 9.1 10.6 4.9 12 1.5zm0 19.5a3 3 0 0 0 3-3c0-1.7-1.3-2.9-3-4.5-1.7 1.6-3 2.8-3 4.5a3 3 0 0 0 3 3z"
      />
    </Icon>
  )
}

/** Raio (tempestade; também o laser da tela). */
export function BoltIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="M13.2 1.6a.6.6 0 0 1 1 .5L13.1 10h6.3a.6.6 0 0 1 .5 1L10.8 22.4a.6.6 0 0 1-1-.5l1.1-7.9H4.6a.6.6 0 0 1-.5-1z" />
    </Icon>
  )
}

export function HeartIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="M12 21s-9-5.4-9-11.6A5 5 0 0 1 12 6.6a5 5 0 0 1 9 2.8C21 15.6 12 21 12 21z" />
    </Icon>
  )
}

/** Nuvem com gotas. */
export function RainIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="M7 16a5 5 0 0 1-.9-9.92A6.5 6.5 0 0 1 18.2 7.1 4.5 4.5 0 0 1 17.5 16z" />
      <rect x="7" y="17.5" width="2" height="5" rx="1" transform="rotate(20 8 20)" />
      <rect x="11" y="17.5" width="2" height="5" rx="1" transform="rotate(20 12 20)" />
      <rect x="15" y="17.5" width="2" height="5" rx="1" transform="rotate(20 16 20)" />
    </Icon>
  )
}

/** Espiral (galáxia). */
export function GalaxyIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path {...STROKE} d="M10.5 12a1.75 1.75 0 0 1 3.5 0 4.75 4.75 0 0 1-9.5 0 7.75 7.75 0 0 1 15.5 0" />
    </Icon>
  )
}

/** Ondas (aurora). */
export function WaveIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path
        {...STROKE}
        d="M2 7q2.5-3 5 0t5 0 5 0 5 0M2 12q2.5-3 5 0t5 0 5 0 5 0M2 17q2.5-3 5 0t5 0 5 0 5 0"
      />
    </Icon>
  )
}

/** Sol listrado sobre a grade em perspectiva (synthwave). */
export function GridIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path fillRule="evenodd" d="M5 11.5a7 7 0 0 1 14 0zm.4-3.25h13.2v1H5.4zm-.3 2h13.8v.6H5.1z" />
      <path {...STROKE} d="M2 14h20M12 14v8M8.5 14 5 22M15.5 14l3.5 8M3.5 18h17" />
    </Icon>
  )
}

/** Faixas deslocadas (glitch). */
export function GlitchIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <rect x="3" y="3.5" width="13" height="4.5" rx="1" />
      <rect x="18" y="3.5" width="3" height="4.5" rx="1" />
      <rect x="2" y="9.75" width="4" height="4.5" rx="1" />
      <rect x="8" y="9.75" width="13" height="4.5" rx="1" />
      <rect x="5" y="16" width="11" height="4.5" rx="1" />
      <rect x="18" y="16" width="4" height="4.5" rx="1" />
    </Icon>
  )
}

/** Colunas de código caindo (matrix). */
export function MatrixIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <rect x="3.5" y="2" width="3" height="5" rx="1" opacity=".5" />
      <rect x="3.5" y="9" width="3" height="4" rx="1" />
      <rect x="3.5" y="15" width="3" height="7" rx="1" />
      <rect x="10.5" y="4" width="3" height="3" rx="1" opacity=".5" />
      <rect x="10.5" y="9" width="3" height="9" rx="1" />
      <rect x="17.5" y="2" width="3" height="3" rx="1" opacity=".5" />
      <rect x="17.5" y="7" width="3" height="6" rx="1" />
      <rect x="17.5" y="15" width="3" height="4" rx="1" />
    </Icon>
  )
}

/** Partículas soltas de tamanhos diferentes. */
export function ParticlesIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <circle cx="6" cy="6.5" r="2.5" />
      <circle cx="16" cy="5" r="1.5" />
      <circle cx="18" cy="13.5" r="3" />
      <circle cx="8" cy="17" r="2" />
      <circle cx="12.5" cy="11" r="1.25" />
      <circle cx="14" cy="20" r="1.5" />
      <circle cx="3.5" cy="12" r="1" />
    </Icon>
  )
}

/** Lança-confete. */
export function ConfettiIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="M2.6 20.2 7 8.3a1 1 0 0 1 1.65-.36l7.4 7.4a1 1 0 0 1-.36 1.65L3.8 21.4a.9.9 0 0 1-1.2-1.2z" />
      <circle cx="17" cy="4" r="1.5" />
      <circle cx="20.5" cy="11" r="1.25" />
      <circle cx="12" cy="3.5" r="1" />
      <rect x="14" y="7" width="2" height="4.5" rx="1" transform="rotate(40 15 9.25)" />
      <rect x="18.5" y="15" width="2" height="4" rx="1" transform="rotate(-30 19.5 17)" />
      <rect x="8.5" y="1" width="2" height="4" rx="1" transform="rotate(-20 9.5 3)" />
    </Icon>
  )
}

/** Vaga-lume: o corpo, o rastro de luz e as asinhas. */
export function FireflyIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <circle cx="12" cy="16" r="4" />
      <g {...STROKE}>
        <path d="M12 12V8M8.5 9.5 5 6M15.5 9.5 19 6M4 16H2M22 16h-2M6 21l-1.5 1.5M18 21l1.5 1.5" />
      </g>
    </Icon>
  )
}

/** Pétala de sakura, com o chanfro na ponta. */
export function PetalIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="M12 22c-5-2.5-8-7-7-12.5C5.6 6 8 3.6 10.2 2l1.8 3.4L13.8 2C16 3.6 18.4 6 19 9.5 20 15 17 19.5 12 22z" />
    </Icon>
  )
}

/** Folha com a nervura vazada. */
export function LeafIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path
        fillRule="evenodd"
        d="M20.5 3C12 3 5.5 6.5 4.5 13c-.3 2 .1 3.8 1 5.3L3 20.8 4.2 22l2.5-2.5c1.5.9 3.3 1.3 5.3 1C18.5 19.5 21 12 20.5 3zM8 17.5l7.5-8.5 1 1L9.2 18.5z"
      />
    </Icon>
  )
}

/** Bolhas de três tamanhos. */
export function BubblesIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <g {...STROKE}>
        <circle cx="9.5" cy="14.5" r="6" />
        <circle cx="18" cy="7" r="3.5" />
        <circle cx="19" cy="17.5" r="1.8" />
        <path d="M6.8 13.5a3 3 0 0 1 2-2" />
      </g>
    </Icon>
  )
}

/** Crista de onda quebrando. */
export function OceanIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <g {...STROKE}>
        <path d="M2 15c2 0 3-2 4.5-5C8 7 10.5 5 14 5c3 0 5 2 5 4.5 0 1.8-1.3 3-3 3-1.3 0-2.3-.8-2.5-2" />
        <path d="M2 20c1.7 0 2.5-1.3 4-1.3S8.3 20 10 20s2.5-1.3 4-1.3 2.3 1.3 4 1.3 2.5-1.3 4-1.3" />
      </g>
    </Icon>
  )
}

/** Estrela cadente: a estrela e os riscos do rastro. */
export function MeteorIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="M8 13l1.5 3.5L13 18l-3.5 1.5L8 23l-1.5-3.5L3 18l3.5-1.5z" />
      <g {...STROKE}>
        <path d="M21 3 12 12M21 9l-5 5M15 3l-5 5" />
      </g>
    </Icon>
  )
}

/** Névoa: linhas onduladas e soltas. */
export function FogIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <g {...STROKE}>
        <path d="M3 7h13M19.5 7H21M3 12h3M9.5 12H21M3 17h10M16.5 17H21" />
      </g>
    </Icon>
  )
}

/** Raios de luz descendo do canto. */
export function SunbeamIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="M3 3h5.5L3 8.5z" />
      <g {...STROKE}>
        <path d="M9 9l12 3M9 9l9 9M9 9l3 12" />
      </g>
    </Icon>
  )
}

/** Lava: lago na base e uma bolha subindo. */
export function LavaIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="M2 16c2-1.5 3.5-1.5 5 0s3.5 1.5 5 0 3.5-1.5 5 0 3.5 1.5 5 0v6H2z" />
      <ellipse cx="9" cy="8" rx="3" ry="4" />
      <circle cx="17" cy="5" r="2" />
    </Icon>
  )
}

/** Nota de dinheiro com o cifrão vazado. */
export function MoneyIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path
        fillRule="evenodd"
        d="M2 6h20v12H2zm10 2.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM5 9v1.5h1.5V9zm12.5 4.5V15H19v-1.5z"
      />
    </Icon>
  )
}

export function CloudIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="M6.5 19a4.5 4.5 0 0 1-.8-8.9 6 6 0 0 1 11.6-1.3A5.2 5.2 0 0 1 17 19z" />
    </Icon>
  )
}

/** Hexágono neon: o contorno e o miolo aceso. */
export function HexagonIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="M12 7.5l3.9 2.25v4.5L12 16.5l-3.9-2.25v-4.5z" />
      <g {...STROKE}>
        <path d="M12 2l8.7 5v10L12 22l-8.7-5V7z" />
      </g>
    </Icon>
  )
}

/** Invasor de fliperama em blocos. */
export function PixelIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="M6 3h2v2h2v2h4V5h2V3h2v2h-2v2h2v2h2v2h2v6h-2v-4h-2v4h-2v2h-4v-2h2v-2H8v2h2v2H6v-2H4v-4H2v4H0v-6h2V9h2V7h2V5h0zM8 10v2h2v-2zm6 0v2h2v-2z" />
    </Icon>
  )
}

/** Cordão com bandeirinhas. */
export function BuntingIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="M3.5 7.5 9 9l-3.5 6zM10.5 9.3h5L13 16zM17 9l5-1.5L20 15z" />
      <g {...STROKE}>
        <path d="M2 6c6 4.5 14 4.5 20 0" />
      </g>
    </Icon>
  )
}

/** Fogos: o estouro em raios, em volta de um miolo. */
export function FireworksIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <circle cx="12" cy="10" r="1.8" />
      <g {...STROKE}>
        <path d="M12 2.5v3M12 14.5v3M4.5 10h3M16.5 10h3M6.7 4.7l2.1 2.1M15.2 13.2l2.1 2.1M17.3 4.7l-2.1 2.1M8.8 13.2l-2.1 2.1M12 20v2" />
      </g>
    </Icon>
  )
}
