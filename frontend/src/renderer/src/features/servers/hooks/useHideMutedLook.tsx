import { useAuthStore } from '../../auth/store/authStore'
import { useHideMutedStore } from '../store/hideMutedStore'
import { HideMutedMark } from '../components/SidebarAreaMenu'

/** O estado e a marca de "Ocultar canais silenciados" neste servidor (nos menus do servidor). */
export function useHideMutedLook(serverId: string | undefined): {
  checked: boolean
  icon: React.ReactNode
} {
  const userId = useAuthStore((s) => s.user?.id)
  const checked = useHideMutedStore((s) => s.isOn(userId ?? '', serverId ?? ''))
  return { checked, icon: <HideMutedMark on={checked} /> }
}
