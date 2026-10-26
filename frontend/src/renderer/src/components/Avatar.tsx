import { useState } from 'react'
import { API_BASE_URL } from '../lib/config'
import { MAESTRO_USER_ID } from '../lib/music'
import maestroGif from '../assets/maestro.gif'
import { isAnimatedMedia, profileMediaSrc } from '../lib/profileMedia'
import { STATUS_META, type PresenceStatus } from '../lib/presenceStatus'
import { useUserLook } from '../store/profileStore'
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
  /** Bolinha de status no canto (sem ela, nada). */
  status?: PresenceStatus | null
  /** Cor do fundo atrás do avatar: recorta a bolinha, como no Discord. */
  cutoutColor?: string
  /** Fundo da inicial quando não há foto. */
  fallbackClassName?: string
  className?: string
}

/** Avatar redondo: foto (GIF anima como no Discord) ou a inicial do nome. */
function Avatar({
  userId,
  name,
  avatarUrl,
  size,
  animate = 'hover',
  status,
  cutoutColor = '#111214',
  fallbackClassName = 'bg-violet-600',
  className = ''
}: AvatarProps): React.JSX.Element {
  const look = useUserLook(userId, { name, avatarUrl })
  const [failedSrc, setFailedSrc] = useState<string | null>(null)

  const animated = isAnimatedMedia(look.avatarUrl)
  const still = profileMediaSrc(look.avatarUrl, API_BASE_URL, { animate: animate === 'always' })
  const moving =
    animated && animate === 'hover' ? profileMediaSrc(look.avatarUrl, API_BASE_URL) : null
  const showImage = still && failedSrc !== still
  // O Maestro não tem foto no banco: o GIF vem embutido no app.
  const maestro = userId === MAESTRO_USER_ID && !showImage

  const dot = Math.max(10, Math.round(size * 0.3))
  const border = size >= 64 ? 5 : size >= 32 ? 3 : 2

  return (
    <div
      className={`group relative shrink-0 ${className}`}
      style={{ width: size, height: size }}
    >
      {maestro ? (
        <img
          src={maestroGif}
          alt=""
          draggable={false}
          style={{ imageRendering: 'pixelated' }}
          className="h-full w-full rounded-full bg-[#1e1f22] object-cover"
        />
      ) : showImage ? (
        <>
          <img
            src={still}
            alt=""
            draggable={false}
            onError={() => setFailedSrc(still)}
            className={`h-full w-full rounded-full object-cover ${moving ? 'group-hover:invisible' : ''}`}
          />
          {moving && (
            <img
              src={moving}
              alt=""
              draggable={false}
              loading="lazy"
              className="invisible absolute inset-0 h-full w-full rounded-full object-cover group-hover:visible"
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
      {status && (
        <span
          title={STATUS_META[status].label}
          aria-label={STATUS_META[status].label}
          className="absolute flex items-center justify-center rounded-full"
          style={{ padding: border, right: -border, bottom: -border, background: cutoutColor }}
        >
          <StatusIcon status={status} size={dot} />
        </span>
      )}
    </div>
  )
}

export default Avatar
