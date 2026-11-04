import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useAuthStore } from '../../auth/store/authStore'
import { useUIStore } from '../../../shared/store/uiStore'
import { CheckIcon } from '../../../shared/ui/icons'
import { Perm } from '../lib/permissions'
import type { ServerAccess } from '../lib/serverAccess'
import { channelAreaMenuItems, type ChannelAreaMenuItem } from '../lib/sidebarMenus'
import { useChannelSidebarStore } from '../store/channelSidebarStore'
import { useHideMutedStore } from '../store/hideMutedStore'
import SidebarMenuItem from './SidebarMenuItem'

const LABEL: Record<ChannelAreaMenuItem, string> = {
  hideMuted: 'Ocultar canais silenciados',
  createChannel: 'Criar canal',
  createCategory: 'Criar categoria',
  invite: 'Convidar pessoas'
}

/** A marca de ligado/desligado de "Ocultar canais silenciados". */
export function HideMutedMark({ on }: { on: boolean }): React.JSX.Element {
  return (
    <span aria-hidden className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${on ? 'border-brand bg-brand text-white' : 'border-subtle'}`}>
      {on && <CheckIcon className="h-3 w-3" />}
    </span>
  )
}

/** Fecha com Escape, rolagem e ao redimensionar; devolve o foco para quem abriu. */
function useMenuDismiss(onClose: () => void): React.RefObject<HTMLDivElement | null> {
  const menu = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const previous = document.activeElement
    menu.current?.querySelector('button')?.focus()
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('scroll', onClose, true)
    window.addEventListener('resize', onClose)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('scroll', onClose, true)
      window.removeEventListener('resize', onClose)
      document.removeEventListener('keydown', onKeyDown)
      if (previous instanceof HTMLElement) previous.focus()
    }
  }, [onClose])
  return menu
}

/** Menu do botão direito (ou de segurar, no toque) na parte vazia da lista de canais. */
export function SidebarAreaMenu({ serverId, access, point, onClose }: {
  serverId: string
  access: ServerAccess
  point: { x: number; y: number }
  onClose: () => void
}): React.JSX.Element {
  const userId = useAuthStore((s) => s.user?.id ?? '')
  const hideMuted = useHideMutedStore((s) => s.isOn(userId, serverId))
  const menu = useMenuDismiss(onClose)
  const items = channelAreaMenuItems({ canManageChannels: access.can(Perm.MANAGE_CHANNELS), canInvite: access.can(Perm.CREATE_INVITE) })
  const actions: Record<ChannelAreaMenuItem, () => void> = {
    hideMuted: () => useHideMutedStore.getState().toggle(userId, serverId),
    createChannel: () => useChannelSidebarStore.getState().openCreate('text'),
    createCategory: () => useChannelSidebarStore.getState().openCategoryDialog({ kind: 'create' }),
    invite: () => useUIStore.getState().openServerInviteModal()
  }
  return createPortal(
    <div className="fixed inset-0 z-50" onClick={onClose} onContextMenu={(event) => { event.preventDefault(); onClose() }}>
      <div ref={menu} role="menu" aria-label="Opções da lista de canais"
        style={{ left: `min(${point.x}px, calc(100vw - 15rem))`, top: `min(${point.y}px, calc(100dvh - 13rem))` }}
        onClick={(event) => event.stopPropagation()}
        className="fixed flex w-56 max-w-[calc(100vw-1rem)] flex-col rounded-xl border border-subtle bg-floating p-1.5 shadow-2xl backdrop-blur-xl">
        {items.map((item) => (
          <SidebarMenuItem key={item} label={LABEL[item]}
            checked={item === 'hideMuted' ? hideMuted : undefined}
            icon={item === 'hideMuted' ? <HideMutedMark on={hideMuted} /> : undefined}
            onClick={() => {
              onClose()
              actions[item]()
            }} />
        ))}
      </div>
    </div>,
    document.body
  )
}
