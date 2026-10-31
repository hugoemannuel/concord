import type { Server } from '../api/servers'
import { serverIconSrc } from '../lib/serverIcon'

/** Ícone (foto/GIF ou inicial) e nome do servidor aberto, no centro da barra de título. */
function TitleBarServer({ server }: { server: Server | null }): React.JSX.Element | null {
  if (!server) return null
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-md bg-surface text-ds-xxs font-bold text-strong">
        {server.icon_url ? (
          <img src={serverIconSrc(server.icon_url)} alt="" className="h-full w-full object-cover" />
        ) : (
          server.name.charAt(0).toUpperCase()
        )}
      </span>
      <span title={server.name} className="truncate text-ds-xs font-semibold text-strong">
        {server.name}
      </span>
    </div>
  )
}

export default TitleBarServer
