// Ações genéricas: criar, editar, apagar, confirmar, fechar, anexar, fixar, reagir, trancar.
import { Icon, LineIcon, SlashedIcon, type IconProps } from './Icon'

/** Olho (amêndoa com a íris vazada e a pupila). */
const EYE = (
  <>
    <path
      fillRule="evenodd"
      d="M12 5C6.6 5 3.1 9.3 2 12c1.1 2.7 4.6 7 10 7s8.9-4.3 10-7c-1.1-2.7-4.6-7-10-7zm0 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z"
    />
    <circle cx="12" cy="12" r="2" />
  </>
)

/** Estrela de 5 pontas e o vão de dentro (para a estrela vazada). */
const STAR =
  'M12 2.6l2.65 6.36 6.86.55-5.23 4.48 1.6 6.7L12 17.1l-5.88 3.59 1.6-6.7-5.23-4.48 6.86-.55z'
const STAR_HOLE =
  'M10.73 10.86l-3.29.26 2.51 2.15-.77 3.21L12 14.76l2.82 1.72-.77-3.21 2.51-2.15-3.29-.26L12 7.81z'

export function PlusIcon(props: IconProps): React.JSX.Element {
  return (
    <LineIcon {...props}>
      <path d="M12 5v14M5 12h14" />
    </LineIcon>
  )
}

export function MinusIcon(props: IconProps): React.JSX.Element {
  return (
    <LineIcon {...props}>
      <path d="M5 12h14" />
    </LineIcon>
  )
}

export function PencilIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34a.9959.9959 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
    </Icon>
  )
}

/** Setinha circular (atualizar com o que está valendo agora). */
export function RefreshIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="M17.65 6.35A7.96 7.96 0 0 0 12 4a8 8 0 1 0 7.73 10h-2.08A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" />
    </Icon>
  )
}

export function TrashIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
    </Icon>
  )
}

export function ArchiveIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="M20.54 5.23l-1.39-1.68C18.88 3.21 18.47 3 18 3H6c-.47 0-.88.21-1.16.55L3.46 5.23C3.17 5.57 3 6.02 3 6.5V19c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6.5c0-.48-.17-.93-.46-1.27zM12 17.5L6.5 12H10v-2h4v2h3.5L12 17.5zM5.12 5l.81-1h12l.94 1H5.12z" />
    </Icon>
  )
}

export function UnarchiveIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="M20.55 5.22l-1.39-1.68A1.51 1.51 0 0018 3H6c-.47 0-.88.21-1.15.55L3.46 5.22C3.17 5.57 3 6.01 3 6.5V19a2 2 0 002 2h14c1.1 0 2-.9 2-2V6.5c0-.49-.17-.93-.45-1.28zM12 9.5l5.5 5.5H14v2h-4v-2H6.5L12 9.5zM5.12 5l.82-1h12l.94 1H5.12z" />
    </Icon>
  )
}

/** Duas folhas sobrepostas (copiar). */
export function CopyIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2z" />
    </Icon>
  )
}

export function CheckIcon(props: IconProps): React.JSX.Element {
  return (
    <LineIcon {...props}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </LineIcon>
  )
}

export function XIcon(props: IconProps): React.JSX.Element {
  return (
    <LineIcon {...props}>
      <path d="M18 6 6 18M6 6l12 12" />
    </LineIcon>
  )
}

/** Barra: herdar (o estado do meio de negar / herdar / permitir). */
export function SlashIcon(props: IconProps): React.JSX.Element {
  return (
    <LineIcon {...props}>
      <path d="M16 4 8 20" />
    </LineIcon>
  )
}

/** Três pontos: mais ações. */
export function DotsIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <circle cx="5" cy="12" r="2.25" />
      <circle cx="12" cy="12" r="2.25" />
      <circle cx="19" cy="12" r="2.25" />
    </Icon>
  )
}

/** Mais ações da mensagem: os mesmos três pontos. */
export const MoreIcon = DotsIcon

/** Clipe de anexar arquivo. */
export function PaperclipIcon(props: IconProps): React.JSX.Element {
  return (
    <LineIcon {...props}>
      <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </LineIcon>
  )
}

export function PinIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="M8 2h8a1 1 0 1 1 0 2h-1v5.5l3.2 2.4a2 2 0 0 1 .8 1.6V15a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-1.5a2 2 0 0 1 .8-1.6L9 9.5V4H8a1 1 0 0 1 0-2z" />
      <rect x="11" y="15" width="2" height="7" rx="1" />
    </Icon>
  )
}

export function UndoIcon(props: IconProps): React.JSX.Element {
  return (
    <LineIcon {...props}>
      <path d="M3 7v6h6" />
      <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
    </LineIcon>
  )
}

/** Seta curva para a direita: refazer (o desfazer espelhado). */
export function RedoIcon(props: IconProps): React.JSX.Element {
  return (
    <LineIcon {...props}>
      <path d="M21 7v6h-6" />
      <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13" />
    </LineIcon>
  )
}

/** Seta curva para a esquerda: responder. */
export function ReplyIcon(props: IconProps): React.JSX.Element {
  return (
    <LineIcon {...props}>
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5V20" />
    </LineIcon>
  )
}

/** Seta curva para a direita: encaminhar (o espelho do responder). */
export function ForwardIcon(props: IconProps): React.JSX.Element {
  return (
    <LineIcon {...props}>
      <path d="m15 14 5-5-5-5" />
      <path d="M20 9H9.5A5.5 5.5 0 0 0 4 14.5V20" />
    </LineIcon>
  )
}

/** Carinha (seletor de emoji). */
export function SmileyIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path
        fillRule="evenodd"
        d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM8.5 7.5a1.75 1.75 0 1 0 0 3.5 1.75 1.75 0 0 0 0-3.5zm7 0a1.75 1.75 0 1 0 0 3.5 1.75 1.75 0 0 0 0-3.5zM7 13.5a5 5 0 0 0 10 0z"
      />
    </Icon>
  )
}

/** A mesma carinha, menor, com um "+": adicionar reação. */
export function AddReactionIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path
        fillRule="evenodd"
        d="M10.5 5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17zm-3 4.75a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm6 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zM6.25 15a4.25 4.25 0 0 0 8.5 0z"
      />
      <path d="M19.5 1a1 1 0 0 1 1 1v2h2a1 1 0 1 1 0 2h-2v2a1 1 0 1 1-2 0V6h-2a1 1 0 1 1 0-2h2V2a1 1 0 0 1 1-1z" />
    </Icon>
  )
}

export function EyeIcon(props: IconProps): React.JSX.Element {
  return <Icon {...props}>{EYE}</Icon>
}

/** Olho riscado: escondido. */
export function EyeOffIcon(props: IconProps): React.JSX.Element {
  return <SlashedIcon {...props}>{EYE}</SlashedIcon>
}

export function LockIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path
        fillRule="evenodd"
        d="M12 2a4 4 0 0 0-4 4v3H7a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2h-1V6a4 4 0 0 0-4-4zm2 7V6a2 2 0 1 0-4 0v3h4zm-2 5a1.5 1.5 0 0 0-.75 2.8v1.7a.75.75 0 0 0 1.5 0v-1.7A1.5 1.5 0 0 0 12 14z"
        clipRule="evenodd"
      />
    </Icon>
  )
}

export function LockOpenIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path
        fillRule="evenodd"
        d="M14 6a2 2 0 0 1 2 2h2a4 4 0 1 0-8 0v1H7a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2H12V8a2 2 0 0 1 2-2zm-2 8a1.5 1.5 0 0 0-.75 2.8v1.7a.75.75 0 0 0 1.5 0v-1.7A1.5 1.5 0 0 0 12 14z"
        clipRule="evenodd"
      />
    </Icon>
  )
}

export function SlidersIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <rect x="3" y="5" width="18" height="2" rx="1" />
      <rect x="3" y="11" width="18" height="2" rx="1" />
      <rect x="3" y="17" width="18" height="2" rx="1" />
      <circle cx="9" cy="6" r="2.75" />
      <circle cx="15" cy="12" r="2.75" />
      <circle cx="7" cy="18" r="2.75" />
    </Icon>
  )
}

/** Estrela (canal principal e favoritos): cheia ou vazada. */
export function StarIcon({
  filled = false,
  ...props
}: IconProps & { filled?: boolean }): React.JSX.Element {
  return (
    <Icon {...props}>
      <path fillRule="evenodd" d={filled ? STAR : `${STAR}${STAR_HOLE}`} />
    </Icon>
  )
}

/** Favorito da mesa de áudio: a mesma estrela. */
export const FavoriteStarIcon = StarIcon

/** Enquete (barras de resultado). */
export function PollIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="M5 4h9a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zm0 6h14a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-2a1 1 0 0 1 1-1zm0 6h6a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-2a1 1 0 0 1 1-1z" />
    </Icon>
  )
}

/** Dado (sortear: "Surpreenda-me"). */
export function DiceIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path
        fillRule="evenodd"
        d="M7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4zm1 3.25a1.75 1.75 0 1 0 0 3.5 1.75 1.75 0 0 0 0-3.5zm8 0a1.75 1.75 0 1 0 0 3.5 1.75 1.75 0 0 0 0-3.5zm-4 4a1.75 1.75 0 1 0 0 3.5 1.75 1.75 0 0 0 0-3.5zm-4 4a1.75 1.75 0 1 0 0 3.5 1.75 1.75 0 0 0 0-3.5zm8 0a1.75 1.75 0 1 0 0 3.5 1.75 1.75 0 0 0 0-3.5z"
      />
    </Icon>
  )
}

/** Círculo cortado: nenhum (sem efeito, sem fundo). */
export function CircleSlashIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path
        fillRule="evenodd"
        d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 2.5a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15z"
      />
      <rect x="10.75" y="2.5" width="2.5" height="19" rx="1.25" transform="rotate(-45 12 12)" />
    </Icon>
  )
}

/** Arquivo (documento com a ponta dobrada): anexo que não é foto, vídeo nem áudio. */
export function FileIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path
        fillRule="evenodd"
        d="M6 2h8l6 6v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm7 1.75V9h5.25L13 3.75z"
      />
    </Icon>
  )
}

/** Baixar: seta para baixo sobre a bandeja. */
export function DownloadIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <rect x="10.75" y="3" width="2.5" height="11.5" rx="1.25" />
      <path d="M6.6 10.1a1.25 1.25 0 0 1 1.77 0L12 13.73l3.63-3.63a1.25 1.25 0 1 1 1.77 1.77l-4.52 4.51a1.25 1.25 0 0 1-1.76 0L6.6 11.87a1.25 1.25 0 0 1 0-1.77z" />
      <rect x="4" y="18.5" width="16" height="2.5" rx="1.25" />
    </Icon>
  )
}
