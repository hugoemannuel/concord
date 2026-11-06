import type { RefObject } from 'react'
import { useDismiss } from '../../../shared/hooks/useDismiss'
import { useChannelSidebarStore } from '../store/channelSidebarStore'
import { shouldDismissMenu } from '../lib/channelSidebar'

/** Com o menu de um canal aberto: clique fora ou Esc fecham. */
export function useChannelMenuDismiss(menuRef: RefObject<HTMLDivElement | null>): void {
  const menuFor = useChannelSidebarStore((s) => s.menuFor)
  const closeMenu = useChannelSidebarStore((s) => s.closeMenu)
  useDismiss((target) => !shouldDismissMenu(target as Element, menuRef.current), () => closeMenu(), {
    enabled: menuFor !== null
  })
}
