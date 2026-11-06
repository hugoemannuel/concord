import { useId, useState } from 'react'
import { Icon, VolumeIcon, type IconProps } from '../../../shared/ui/icons'
import ServerIcon from '../../../shared/ui/ServerIcon'
import type { Server } from '../api/servers'
import { badgeText, voiceBadgeLabel } from '../lib/serverRailBadge'
import type { RailDropZone } from '../lib/serverRailDrop'
import type { ServerRailView } from '../lib/serverRailView'
import type { MenuPoint } from '../lib/menuPoint'
import { useRailMenuTrigger } from '../hooks/useRailMenuTrigger'
import ServerHoverCard from './ServerHoverCard'
import { RailDropIndicator } from './ServerRailItem'

export function FolderGlyph(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2z" />
    </Icon>
  )
}

interface ServerFolderItemProps {
  name: string
  servers: Server[]
  collapsed: boolean
  anyActive: boolean
  view: ServerRailView
  dragging?: boolean
  dropZone?: RailDropZone | null
  dragProps?: React.HTMLAttributes<HTMLDivElement> & { draggable?: boolean }
  onToggle: () => void
  onContextMenu: (point: MenuPoint) => void
  children: React.ReactNode
}

function MiniServerGrid({ servers }: { servers: Server[] }): React.JSX.Element {
  const preview = servers.slice(0, 4)
  return (
    <span className="pointer-events-none select-none grid h-full w-full grid-cols-2 grid-rows-2 gap-1 p-1.5">
      {preview.map((srv) => (
        <ServerIcon
          key={srv.id}
          name={srv.name}
          iconUrl={srv.icon_url}
          size="fill"
          shape="full"
          text="xxs"
          className="bg-surface font-bold text-strong"
          fallbackClassName=""
          pinned
        />
      ))}
    </span>
  )
}

function FolderBadges({ view }: { view: ServerRailView }): React.JSX.Element {
  const voiceLabel = voiceBadgeLabel(view.voice === 'mine')
  return (
    <>
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
    </>
  )
}

function leftBarClass(collapsed: boolean, anyActive: boolean): string {
  if (!collapsed) return 'h-0'
  return anyActive ? 'h-10' : 'h-0 group-hover/folder:h-5'
}

function folderRingClass(dropZone?: RailDropZone | null): string {
  return dropZone === 'inside' ? 'ring-2 ring-brand bg-brand/25 scale-110' : ''
}

/**
 * Pasta de servidores na barra lateral: recolhida mostra grade 2x2 de miniaturas
 * com selos agregados; aberta envolve o botão de pasta e os servidores numa pílula.
 */
function ServerFolderItem({
  name,
  servers,
  collapsed,
  anyActive,
  view,
  dragging = false,
  dropZone = null,
  dragProps,
  onToggle,
  onContextMenu,
  children
}: ServerFolderItemProps): React.JSX.Element {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const cardId = useId()
  const menu = useRailMenuTrigger(onContextMenu)

  return (
    <div
      className={`relative flex flex-col items-center group/folder ${dragging ? 'opacity-40' : ''}`}
    >
      <RailDropIndicator zone={dropZone} />
      <div
        className={
          collapsed
            ? 'relative flex items-center justify-center'
            : `flex flex-col items-center gap-2 rounded-xl border border-subtle bg-fg/10 px-1 py-1.5 transition-colors ${folderRingClass(dropZone)}`
        }
      >
        <div {...dragProps} className="relative flex items-center justify-center">
          <span
            className={`absolute -left-3.5 w-2 rounded-r-full bg-[var(--text-strong)] transition-all duration-200 ${leftBarClass(collapsed, anyActive)}`}
          />
          <button
            type="button"
            onClick={onToggle}
            onContextMenu={menu.onContextMenu}
            onPointerDown={menu.onPointerDown}
            onPointerMove={menu.onPointerMove}
            onPointerUp={menu.onPointerUp}
            onPointerCancel={menu.onPointerCancel}
            onPointerEnter={(e) => e.pointerType !== 'touch' && setAnchor(e.currentTarget)}
            onPointerLeave={() => {
              menu.cancel()
              setAnchor(null)
            }}
            onFocus={(e) => e.currentTarget.matches(':focus-visible') && setAnchor(e.currentTarget)}
            onBlur={() => setAnchor(null)}
            aria-label={name}
            aria-expanded={!collapsed}
            aria-describedby={anchor ? cardId : undefined}
            className={`relative flex h-12 w-12 cursor-pointer items-center justify-center overflow-hidden rounded-xl border border-subtle transition-all duration-200 ${
              collapsed && view.dimmed ? 'opacity-50' : ''
            } ${
              collapsed
                ? `bg-fg/10 text-strong hover:bg-brand/20 ${folderRingClass(dropZone)}`
                : 'bg-surface text-brand hover:bg-brand/20'
            }`}
          >
            {collapsed ? <MiniServerGrid servers={servers} /> : <FolderGlyph size={24} />}
          </button>
          {collapsed && <FolderBadges view={view} />}
        </div>
        {!collapsed && <div className="flex flex-col items-center gap-2">{children}</div>}
      </div>
      {anchor && (
        <ServerHoverCard
          id={cardId}
          anchor={anchor}
          name={name}
          people={[]}
          onClose={() => setAnchor(null)}
        />
      )}
    </div>
  )
}

export default ServerFolderItem
