import type { Server } from '../api/servers'
import ServerIcon from '../../../shared/ui/ServerIcon'

/** Ícone (foto/GIF ou inicial) e nome do servidor aberto, no centro da barra de título. */
function TitleBarServer({ server }: { server: Server | null }): React.JSX.Element | null {
  if (!server) return null
  return (
    <div className="flex min-w-0 items-center gap-2">
      <ServerIcon
        name={server.name}
        iconUrl={server.icon_url}
        size="sm"
        className="bg-surface font-bold text-strong"
        fallbackClassName=""
      />
      <span title={server.name} className="truncate text-ds-xs font-semibold text-strong">
        {server.name}
      </span>
    </div>
  )
}

export default TitleBarServer
