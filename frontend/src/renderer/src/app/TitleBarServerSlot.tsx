import { useSyncExternalStore } from 'react'
import { router } from './router'
import { useServerStore } from '../features/servers/store/serverStore'
import { serverOnScreen } from '../features/servers/lib/serverOnScreen'
import TitleBarServer from '../features/servers/components/TitleBarServer'

const subscribe = (onChange: () => void): (() => void) => router.subscribe(onChange)
const currentPath = (): string => router.state.location.pathname

/**
 * Liga a barra de título (fora do RouterProvider) à rota atual e ao servidor
 * aberto: lê a rota direto do router.
 */
function TitleBarServerSlot(): React.JSX.Element | null {
  const pathname = useSyncExternalStore(subscribe, currentPath)
  const current = useServerStore((s) => s.currentServer)
  return <TitleBarServer server={serverOnScreen(pathname, current)} />
}

export default TitleBarServerSlot
