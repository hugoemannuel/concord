import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { DiamondIcon, PlusIcon } from '../../../shared/ui/icons'
import { useServerStore } from '../store/serverStore'
import { useServerRailSync } from '../hooks/useServerRailSync'
import { useRailBadges } from '../hooks/useRailBadges'
import { isHomePath } from '../lib/railHome'
import { HUB_PATH, isHubPath } from '../../improvements/lib/hub'
import { RailHomeButton, RailNavButton } from './ServerRailButtons'
import ServerRailList from './ServerRailList'
import RailDms from './RailDms'
import GuestVisitsRail from '../../guests/components/GuestVisitsRail'
import CreateServerModal from './CreateServerModal'

function ServerRail(): React.JSX.Element {
  const location = useLocation()
  const navigate = useNavigate()
  const clearCurrentServer = useServerStore((s) => s.clearCurrentServer)
  const [createModalOpen, setCreateModalOpen] = useState(false)

  useServerRailSync()
  const onHub = isHubPath(location.pathname)
  // A bolinha de propostas só some quando o quadro está aberto.
  const { dmUnread, proposalsBadge } = useRailBadges(location.pathname === '/proposals')

  const goTo = (path: string): void => {
    clearCurrentServer()
    navigate(path)
  }

  return (
    <>
      <aside className="group/rail flex h-full w-18 shrink-0 flex-col items-center gap-2 border-r border-subtle bg-tertiary py-3 backdrop-blur-2xl">
        {/* Início: Mensagens Diretas, Amigos e convites de servidor */}
        <RailHomeButton
          isHome={isHomePath(location.pathname)}
          unread={dmUnread}
          onClick={clearCurrentServer}
        />

        {/* Quem te mandou mensagem no privado e ainda não foi lida */}
        <RailDms onOpen={clearCurrentServer} />

        <div className="my-1 h-0.5 w-8 rounded-full bg-fg/10" />

        {/* Aba do diamante: Propostas, Novidades e Rank global */}
        <RailNavButton
          label="Melhorias"
          active={onHub}
          badge={proposalsBadge}
          icon={(cls) => <DiamondIcon className={cls} />}
          onClick={() => goTo(HUB_PATH)}
        />

        <ServerRailList />

        {/* Visitas: acessos de visitante (link para uma call) da conta */}
        <GuestVisitsRail />

        {/* Add Server Button */}
        <div className="group/btn relative flex items-center justify-center">
          <button
            onClick={() => setCreateModalOpen(true)}
            title="Adicionar um servidor"
            aria-label="Adicionar servidor"
            className="flex h-12 w-12 cursor-pointer items-center justify-center rounded-[50%] border border-subtle bg-surface text-success transition-all duration-200 hover:rounded-xl hover:bg-success hover:text-white hover:shadow-lg hover:shadow-success/25"
          >
            <PlusIcon className="h-6 w-6" />
          </button>
        </div>

        <div className="flex-1" />
      </aside>

      <CreateServerModal open={createModalOpen} onClose={() => setCreateModalOpen(false)} />
    </>
  )
}

export default ServerRail
