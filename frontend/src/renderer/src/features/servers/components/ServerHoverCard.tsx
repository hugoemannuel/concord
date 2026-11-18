import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { VolumeIcon } from '../../../shared/ui/icons'
import type { VoiceMember } from '../../call/lib/voiceServer'
import { voicePeopleLabel } from '../lib/serverHoverCard'
import { VoiceAvatarStack } from './VoiceAvatarStack'

const GAP = 14

/** Conteúdo do cartão: nome em negrito e, com gente em call, ícone + avatares + "+N". */
export function ServerHoverCardBody({
  name,
  people
}: {
  name: string
  people: VoiceMember[]
}): React.JSX.Element {
  return (
    <>
      <p className="truncate text-ds-sm font-bold text-strong">{name}</p>
      {people.length > 0 && (
        <div
          role="img"
          aria-label={voicePeopleLabel(people)}
          className="mt-1.5 flex items-center gap-2"
        >
          <VolumeIcon className="h-4 w-4 shrink-0 text-success" />
          <VoiceAvatarStack people={people} ringClass="ring-[var(--bg-floating)]" />
        </div>
      )}
    </>
  )
}

/**
 * Cartão ao lado do ícone do servidor (hover ou foco de teclado). Fica num portal
 * com posição fixa porque a lista de servidores rola e cortaria um filho absoluto.
 * Não captura o mouse (pointer-events-none): nunca atrapalha o clique/toque no ícone.
 */
function ServerHoverCard({
  id,
  anchor,
  name,
  people,
  onClose
}: {
  id: string
  /** Botão do servidor que abriu o cartão. */
  anchor: HTMLElement
  name: string
  people: VoiceMember[]
  onClose: () => void
}): React.JSX.Element {
  // Posição lida uma vez: rolar a lista ou redimensionar fecha o cartão.
  const [rect] = useState(() => anchor.getBoundingClientRect())

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('scroll', onClose, true)
    window.addEventListener('resize', onClose)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('scroll', onClose, true)
      window.removeEventListener('resize', onClose)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose])

  return createPortal(
    <div
      id={id}
      role="tooltip"
      style={{ left: rect.right + GAP, top: rect.top + rect.height / 2 }}
      className="pointer-events-none fixed z-50 max-w-[min(16rem,calc(100vw-6rem))] min-w-24 -translate-y-1/2 rounded-lg border border-subtle bg-floating px-3 py-2 shadow-2xl shadow-black/60"
    >
      <ServerHoverCardBody name={name} people={people} />
    </div>,
    document.body
  )
}

export default ServerHoverCard
