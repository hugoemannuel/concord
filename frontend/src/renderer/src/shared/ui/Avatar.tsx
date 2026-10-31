import { useState } from 'react'
import { API_BASE_URL } from '../lib/config'
import { MAESTRO_USER_ID } from '../../features/music/lib/music'
import { SALINHA_BOT_USER_ID } from '../../features/music/lib/bots'
import MaestroImage from '../../features/music/components/MaestroImage'
import { SalinhaMarkIcon } from './icons'
import { isAnimatedMedia, profileMediaSrc } from '../../features/profile/lib/profileMedia'
import { decorationBox, mediaLayers } from '../../features/profile/lib/cosmetics'
import { STATUS_META, type PresenceStatus } from '../../features/friends/lib/presenceStatus'
import { useUserLook } from '../../features/profile/store/profileStore'
import StatusIcon from './StatusIcon'

export type AvatarAnimate = 'always' | 'hover' | 'never'

interface AvatarProps {
  /** Com o id, usa a foto/nome mais novos do profileStore (user:update). */
  userId?: string
  name: string
  avatarUrl?: string | null
  /** Lado em pixels. */
  size: number
  /**
   * GIF: 'always' anima (cartão, editor, barra de baixo); 'hover' fica parado e
   * anima com o mouse em cima dele ou de um ancestral com a classe "group"
   * (listas, chat, call); 'never' fica parado.
   */
  animate?: AvatarAnimate
  /** Moldura por cima do avatar (#482); sem ela, nada. */
  decorationUrl?: string | null
  /**
   * A linha em volta está em hover/foco: com animate 'hover', só então a
   * moldura GIF é montada (fora disso, só o quadro parado é baixado).
   */
  active?: boolean
  /** Bolinha de status no canto (sem ela, nada). */
  status?: PresenceStatus | null
  /** Cor do fundo atrás do avatar: recorta a bolinha, como no Discord. */
  cutoutColor?: string
  /** Fundo da inicial quando não há foto. */
  fallbackClassName?: string
  className?: string
}

/** Bolinha de status no canto do avatar, com o recorte na cor do fundo. */
function AvatarStatus({
  status,
  size,
  cutoutColor
}: {
  status: PresenceStatus
  size: number
  cutoutColor: string
}): React.JSX.Element {
  const dot = Math.max(10, Math.round(size * 0.3))
  const border = size >= 64 ? 5 : size >= 32 ? 3 : 2
  return (
    <span
      title={STATUS_META[status].label}
      aria-label={STATUS_META[status].label}
      className="absolute flex items-center justify-center rounded-full"
      style={{ padding: border, right: -border, bottom: -border, background: cutoutColor }}
    >
      <StatusIcon status={status} size={dot} />
    </span>
  )
}

/** Moldura: 1,2× o avatar, centralizada, sem pegar clique nem mexer no layout. */
function AvatarDecoration({
  url,
  size,
  animate,
  active
}: {
  url: string
  size: number
  animate: AvatarAnimate
  active: boolean
}): React.JSX.Element | null {
  const { still, moving } = mediaLayers(url, API_BASE_URL, { animate, active })
  if (!still) return null
  const { side, offset } = decorationBox(size)
  const style = { width: side, height: side, left: offset, top: offset }
  const className = 'pointer-events-none absolute max-w-none select-none'
  return (
    <>
      <img
        data-decoration
        loading="lazy"
        src={still}
        alt=""
        aria-hidden="true"
        draggable={false}
        decoding="async"
        style={style}
        className={className}
      />
      {moving && (
        <img
          data-decoration
          src={moving}
          alt=""
          aria-hidden="true"
          draggable={false}
          style={style}
          className={className}
        />
      )}
    </>
  )
}

/** Avatar redondo: foto (GIF anima como no Discord) ou a inicial do nome. */
function Avatar({
  userId,
  name,
  avatarUrl,
  size,
  animate = 'hover',
  status,
  cutoutColor = 'var(--bg-floating)',
  fallbackClassName = 'bg-brand',
  className = '',
  decorationUrl,
  active = false
}: AvatarProps): React.JSX.Element {
  const look = useUserLook(userId, { name, avatarUrl, decorationUrl })
  const [failedSrc, setFailedSrc] = useState<string | null>(null)

  const animated = isAnimatedMedia(look.avatarUrl)
  const still = profileMediaSrc(look.avatarUrl, API_BASE_URL, { animate: animate === 'always' })
  const moving =
    animated && animate === 'hover' ? profileMediaSrc(look.avatarUrl, API_BASE_URL) : null
  const showImage = still && failedSrc !== still
  // O Maestro não tem foto no banco: o GIF vem embutido no app. O Salinha Bot
  // usa o ícone da Salinha (o mesmo da tela de login).
  const maestro = userId === MAESTRO_USER_ID && !showImage
  const salinhaBot = userId === SALINHA_BOT_USER_ID && !showImage

  return (
    <div className={`group relative shrink-0 ${className}`} style={{ width: size, height: size }}>
      {maestro ? (
        <MaestroImage className="h-full w-full rounded-full bg-accent object-cover" />
      ) : salinhaBot ? (
        <div className="flex h-full w-full items-center justify-center rounded-full bg-gradient-brand text-white">
          <SalinhaMarkIcon className="h-[72%] w-[72%]" />
        </div>
      ) : showImage ? (
        <>
          <img
            src={still}
            alt=""
            draggable={false}
            onError={() => setFailedSrc(still)}
            className={`h-full w-full rounded-full object-cover ${moving ? 'group-hover:invisible group-focus-within:invisible' : ''}`}
          />
          {moving && (
            <img
              src={moving}
              alt=""
              draggable={false}
              loading="lazy"
              className="invisible absolute inset-0 h-full w-full rounded-full object-cover group-hover:visible group-focus-within:visible"
            />
          )}
        </>
      ) : (
        <div
          className={`flex h-full w-full items-center justify-center rounded-full font-bold text-white ${fallbackClassName}`}
          style={{ fontSize: Math.max(9, Math.round(size * 0.4)) }}
        >
          {(look.name || '?').charAt(0).toUpperCase()}
        </div>
      )}
      {look.decorationUrl && (
        <AvatarDecoration url={look.decorationUrl} size={size} animate={animate} active={active} />
      )}
      {status && <AvatarStatus status={status} size={size} cutoutColor={cutoutColor} />}
    </div>
  )
}

export default Avatar
