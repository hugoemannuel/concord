import { useEffect, useState } from 'react'
import { useServerSettingsStore } from '../store/serverSettingsStore'
import { useServerStore } from '../store/serverStore'
import { useChatStore } from '../../chat/store/chatStore'
import { useServerAccess } from '../hooks/useServerAccess'
import { showToast } from '../../../shared/store/toastStore'
import { router } from '../../../app/router'
import { actionErrorMessage } from '../lib/permissionErrors'
import {
  resolveServerSection,
  serverSectionLabel,
  visibleServerSections
} from '../lib/serverSettingsNav'
import SettingsShell from '../../../shared/ui/SettingsShell'
import ConfirmModal from '../../friends/components/ConfirmModal'
import OverviewSection from './OverviewSection'
import RolesSection from './RolesSection'
import ServerSettingsNav from './ServerSettingsNav'
import MembersSection from './MembersSection'
import BansSection from './BansSection'
import ServerLevelSection from '../../serverlevel/components/ServerLevelSection'
import EventsSettingsSection from '../../events/components/EventsSettingsSection'
import AuditLogSection from '../../auditlog/components/AuditLogSection'
import { useEventAccess } from '../../events/hooks/useEventAccess'

const SECTION_VIEW = {
  overview: OverviewSection,
  level: ServerLevelSection,
  roles: RolesSection,
  members: MembersSection,
  bans: BansSection,
  audit: AuditLogSection,
  events: EventsSettingsSection
} as const

/**
 * Configurações do servidor em tela cheia, como as de usuário: visão geral,
 * nível, cargos, membros, banimentos e registro de auditoria. Cada seção só aparece para quem tem a
 * permissão (o servidor confere de novo a cada ação).
 */
function ServerSettingsScreen(): React.JSX.Element | null {
  const open = useServerSettingsStore((s) => s.open)
  return open ? <ServerSettingsContent /> : null
}

function ServerSettingsContent(): React.JSX.Element | null {
  const wanted = useServerSettingsStore((s) => s.section)
  const goTo = useServerSettingsStore((s) => s.goTo)
  const close = useServerSettingsStore((s) => s.close)
  const server = useServerStore((s) => s.currentServer)
  const access = useServerAccess()
  const [leaving, setLeaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Quem recebeu "Configurar eventos" abre a seção Eventos mesmo sem nenhuma permissão de servidor.
  const canConfigureEvents = Boolean(useEventAccess(server?.id)?.configure)
  const sections = visibleServerSections(access.perms, access.isOwner, canConfigureEvents)
  const current = resolveServerSection(access.perms, wanted, access.isOwner, canConfigureEvents)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !e.defaultPrevented) close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close])

  // Perdeu o acesso (cargo tirado, saiu do servidor): fecha sozinha.
  useEffect(() => {
    if (!server || current === null) close()
  }, [server, current, close])

  if (!server || current === null) return null

  const View = SECTION_VIEW[current]
  const label = serverSectionLabel(sections, current)

  const leaveAndGo = (): void => {
    useChatStore.getState().handleServerDeleted(server.id)
    close()
    void router.navigate('/friends')
  }

  return (
    <SettingsShell
      ariaLabel="Configurações do servidor"
      sectionKey={current}
      title={label}
      titleClassName="text-ds-lg font-bold text-strong"
      contentClassName="max-w-[860px]"
      closeLabel="Fechar configurações do servidor"
      onClose={close}
      nav={
        <ServerSettingsNav
          serverName={server.name}
          sections={sections}
          currentId={current}
          onGo={goTo}
          isOwner={access.isOwner}
          onDelete={() => setDeleting(true)}
          onLeave={() => setLeaving(true)}
        />
      }
      overlay={
        <>
          <ConfirmModal
            open={leaving}
            title={`Sair de ${server.name}`}
            confirmLabel="Sair do servidor"
            onClose={() => setLeaving(false)}
            onConfirm={async () => {
              try {
                await useServerStore.getState().leaveServer(server.id)
                leaveAndGo()
              } catch (err) {
                showToast.error(actionErrorMessage(err, 'Não foi possível sair do servidor.'))
              }
            }}
          >
            <p>
              Você sai de <b className="text-strong">{server.name}</b> e só volta com um novo convite.
            </p>
          </ConfirmModal>

          <ConfirmModal
            open={deleting}
            title={`Deletar ${server.name}`}
            confirmLabel="Deletar servidor"
            onClose={() => setDeleting(false)}
            onConfirm={async () => {
              try {
                await useServerStore.getState().deleteServer(server.id)
                leaveAndGo()
                showToast.success('Servidor deletado!')
              } catch (err) {
                showToast.error(actionErrorMessage(err, 'Falha ao deletar servidor.'))
              }
            }}
          >
            <p>
              Todos os canais e mensagens de <b className="text-strong">{server.name}</b> serão apagados
              e todos os membros serão removidos. Esta ação não pode ser desfeita.
            </p>
          </ConfirmModal>
        </>
      }
    >
      <View />
    </SettingsShell>
  )
}

export default ServerSettingsScreen
