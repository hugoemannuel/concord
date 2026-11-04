import { useId, useState } from 'react'
import { VolumeIcon } from '../../../shared/ui/icons'
import type { VoiceMember } from '../../call/lib/voiceServer'
import { serverIconSrc } from '../lib/serverIcon'
import { badgeText, voiceBadgeLabel } from '../lib/serverRailBadge'
import type { RailDropZone } from '../lib/serverRailDrop'
import type { ServerRailView } from '../lib/serverRailView'
import ServerHoverCard from './ServerHoverCard'

const NO_PEOPLE: VoiceMember[] = []

/** Linha indicadora de soltar antes ou depois de um item da barra lateral. */
export function RailDropIndicator({ zone }: { zone?: RailDropZone | null }): React.JSX.Element | null {
  if (zone !== 'before' && zone !== 'after') return null
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-x-1 z-20 h-1 rounded-full bg-brand shadow-md shadow-brand/50 ${
        zone === 'before' ? '-top-1.5' : '-bottom-1.5'
      }`}
    />
  )
}

function itemButtonLook(isActive: boolean, dimmed: boolean, dropZone?: RailDropZone | null): string {
  const dim = dimmed ? 'opacity-50' : ''
  const inside =
    dropZone === 'inside' ? 'ring-2 ring-brand scale-110 bg-brand/25 rounded-xl' : ''
  const shape = isActive
    ? 'rounded-xl bg-brand text-white shadow-md shadow-brand/30'
    : 'rounded-[50%] bg-surface border border-subtle text-strong hover:text-white hover:rounded-xl hover:bg-brand hover:shadow-md hover:shadow-brand/30'
  return `${dim} ${shape} ${inside}`
}

interface ServerRailItemProps {
  name: string
  iconUrl?: string | null
  isActive: boolean
  view: ServerRailView
  /** Quem está em call no servidor (cartão do hover); sem call, vazio. */
  people?: VoiceMember[]
  dragging?: boolean
  dropZone?: RailDropZone | null
  dragProps?: React.HTMLAttributes<HTMLDivElement> & { draggable?: boolean }
  onOpen: () => void
  onContextMenu: (e: React.MouseEvent<HTMLButtonElement>) => void
}

/** Ícone de um servidor na barra lateral, com selos e o cartão de hover/foco. */
function ServerRailItem({
  name,
  iconUrl,
  isActive,
  view,
  people = NO_PEOPLE,
  dragging = false,
  dropZone = null,
  dragProps,
  onOpen,
  onContextMenu
}: ServerRailItemProps): React.JSX.Element {
  // Botão sob o mouse/foco: some o cartão ao sair, desfocar ou rolar a lista.
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const cardId = useId()
  const voiceLabel = voiceBadgeLabel(view.voice === 'mine')

  return (
    <div
      {...dragProps}
      className={`relative flex items-center justify-center group/srv ${dragging ? 'opacity-40' : ''}`}
    >
      <RailDropIndicator zone={dropZone} />
      <span
        className={`absolute -left-3.5 w-2 rounded-r-full bg-[var(--text-strong)] transition-all duration-200 ${
          isActive ? 'h-10' : 'h-0 group-hover/srv:h-5'
        }`}
      />
      <button
        onClick={onOpen}
        onContextMenu={(e) => {
          e.preventDefault()
          onContextMenu(e)
        }}
        // Só mouse/caneta: no toque o cartão não abre e não atrapalha o toque no ícone.
        onPointerEnter={(e) => e.pointerType !== 'touch' && setAnchor(e.currentTarget)}
        onPointerLeave={() => setAnchor(null)}
        // Teclado: aparece no foco; clique com mouse também foca, mas aí não é focus-visible.
        onFocus={(e) => e.currentTarget.matches(':focus-visible') && setAnchor(e.currentTarget)}
        onBlur={() => setAnchor(null)}
        aria-label={name}
        aria-describedby={anchor ? cardId : undefined}
        className={`group/btn relative flex h-12 w-12 items-center justify-center font-bold text-ds-md transition-all duration-200 cursor-pointer overflow-hidden ${itemButtonLook(isActive, view.dimmed, dropZone)}`}
      >
        {iconUrl ? (
          <img
            src={serverIconSrc(iconUrl)}
            alt=""
            draggable={false}
            className="pointer-events-none select-none h-full w-full object-cover"
          />
        ) : (
          <span className="pointer-events-none select-none">{name.charAt(0).toUpperCase()}</span>
        )}
      </button>
      {view.badge > 0 && (
        <span className="absolute -bottom-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-ds-xxs font-bold text-white shadow-md">
          {badgeText(view.badge)}
        </span>
      )}
      {view.voice && (
        <span
          aria-label={voiceLabel}
          className={`absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border-[3px] border-[var(--bg-app)] shadow-md ${
            view.voice === 'mine' ? 'bg-success text-white' : 'bg-accent text-success'
          }`}
        >
          <VolumeIcon className="h-3 w-3" />
        </span>
      )}
      {anchor && (
        <ServerHoverCard
          id={cardId}
          anchor={anchor}
          name={name}
          people={people}
          onClose={() => setAnchor(null)}
        />
      )}
    </div>
  )
}

export default ServerRailItem
