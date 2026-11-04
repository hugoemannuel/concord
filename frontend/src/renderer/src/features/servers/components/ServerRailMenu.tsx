import { Fragment } from 'react'
import { useAuthStore } from '../../auth/store/authStore'
import { useEventAccess } from '../../events/hooks/useEventAccess'
import { useNotifySettingsStore } from '../../notifications/store/notifySettingsStore'
import { DEFAULT_NOTIFY_SETTINGS } from '../../notifications/lib/notificationMute'
import { useNow } from '../../../shared/hooks/useNow'
import { showToast } from '../../../shared/store/toastStore'
import ContextSubmenu from '../../../shared/ui/ContextSubmenu'
import { FolderGlyph } from './ServerFolderItem'
import SidebarMenuItem, { SIDEBAR_MENU_ITEM_CLASS } from './SidebarMenuItem'
import { commitRailLayout } from '../hooks/useServerRailDrag'
import { useServerMenuActions } from '../hooks/useServerMenuActions'
import { useServerMenuData } from '../hooks/useServerMenuData'
import { useHideMutedLook } from '../hooks/useHideMutedLook'
import { applyRailMove, railMoveEntries, type RailMoveEntry } from '../lib/railMoveMenu'
import type { ServerMenuActions } from '../lib/serverMenuActions'
import { railMenuGroups, serverMenuContext, settingsSectionsFor, type ServerMenuItem } from '../lib/serverMenu'
import { SERVER_MENU_LOOK } from '../lib/serverMenuLook'
import { mutedSettings, serverMuteChoice, unmutedSettings } from '../lib/serverMute'
import type { ServerSettingsSection } from '../lib/serverSettingsNav'
import type { RailLayoutItem } from '../lib/serverRailLayout'
import { useServerLayoutStore } from '../store/serverLayoutStore'

const ITEM = SIDEBAR_MENU_ITEM_CLASS
const ICON = 'h-3.5 w-3.5'

interface EntryProps {
  serverId: string
  actions: ServerMenuActions
  items: RailLayoutItem[]
  onClose: () => void
  settingsSections: ServerSettingsSection[]
}

function saveMute(serverId: string, next: ReturnType<typeof mutedSettings>): void {
  useNotifySettingsStore
    .getState()
    .saveServer(serverId, next)
    .catch(() => showToast.error('Não foi possível silenciar o servidor.'))
}

/** "Silenciar servidor" com as durações; silenciado, vira "Reativar servidor". */
function MuteEntry({ serverId, onClose }: Pick<EntryProps, 'serverId' | 'onClose'>): React.JSX.Element {
  const current = useNotifySettingsStore((s) => s.servers[serverId]) ?? DEFAULT_NOTIFY_SETTINGS
  const choice = serverMuteChoice(current, useNow())
  const look = SERVER_MENU_LOOK.mute
  if (choice.kind === 'unmute') {
    return (
      <SidebarMenuItem
        role="menuitem"
        label="Reativar servidor"
        icon={look.icon}
        onClick={() => {
          onClose()
          saveMute(serverId, unmutedSettings(current))
        }}
      />
    )
  }
  return (
    <ContextSubmenu label={look.label} triggerClass={ITEM}>
      {choice.options.map((option) => (
        <SidebarMenuItem
          key={option.label}
          role="menuitem"
          label={option.label}
          onClick={() => {
            onClose()
            saveMute(serverId, mutedSettings(current, option.ms, Date.now()))
          }}
        />
      ))}
    </ContextSubmenu>
  )
}

/** As seções das configurações que a permissão deixa abrir. */
function SettingsEntry({ actions, settingsSections, onClose }: EntryProps): React.JSX.Element {
  return (
    <ContextSubmenu label={SERVER_MENU_LOOK.settings.label} triggerClass={ITEM}>
      {settingsSections.map((section) => (
        <SidebarMenuItem
          key={section.id}
          role="menuitem"
          label={section.label}
          onClick={() => {
            onClose()
            actions.openSettingsSection(section.id)
          }}
        />
      ))}
    </ContextSubmenu>
  )
}

const MOVE_LABEL: Record<RailMoveEntry['kind'], string> = {
  'new-folder': 'Criar pasta',
  'to-folder': '',
  'out-of-folder': 'Tirar da pasta',
  up: 'Mover para cima',
  down: 'Mover para baixo'
}

/** "Mover para…": pastas do trilho (ADR 0049), criar pasta, tirar da pasta e subir/descer. */
function MoveEntry({ serverId, items, onClose }: EntryProps): React.JSX.Element {
  const openFolderModal = useServerLayoutStore((s) => s.openFolderModal)
  const pick = (entry: RailMoveEntry): void => {
    onClose()
    const next = applyRailMove(items, serverId, entry)
    if (next) void commitRailLayout(next)
    else openFolderModal({ mode: 'create', initialServerIds: [serverId] })
  }
  return (
    <ContextSubmenu label={SERVER_MENU_LOOK.moveTo.label} triggerClass={ITEM}>
      {railMoveEntries(items, serverId).map((entry) => (
        <SidebarMenuItem
          key={entry.kind === 'to-folder' ? entry.folderId : entry.kind}
          role="menuitem"
          label={entry.kind === 'to-folder' ? `Mover para ${entry.name}` : MOVE_LABEL[entry.kind]}
          icon={entry.kind === 'new-folder' || entry.kind === 'to-folder' ? <FolderGlyph className={ICON} /> : undefined}
          onClick={() => pick(entry)}
        />
      ))}
    </ContextSubmenu>
  )
}

/** "Ocultar canais silenciados": item de ligar e desligar deste servidor. */
function HideMutedEntry({ serverId, actions, onClose }: EntryProps): React.JSX.Element {
  const look = useHideMutedLook(serverId)
  return (
    <SidebarMenuItem
      {...SERVER_MENU_LOOK.hideMuted}
      {...look}
      onClick={() => {
        onClose()
        actions.hideMuted()
      }}
    />
  )
}

function Entry(props: EntryProps & { item: ServerMenuItem }): React.JSX.Element {
  const { item, actions, onClose } = props
  if (item === 'hideMuted') return <HideMutedEntry {...props} />
  if (item === 'mute') return <MuteEntry {...props} />
  if (item === 'moveTo') return <MoveEntry {...props} />
  if (item === 'settings') return <SettingsEntry {...props} />
  return (
    <SidebarMenuItem
      role="menuitem"
      {...SERVER_MENU_LOOK[item]}
      onClick={() => {
        onClose()
        actions[item]()
      }}
    />
  )
}

/**
 * Menu do botão direito no ícone de um servidor: os mesmos itens do menu de
 * dentro (lib/serverMenu), mais silenciar, marcar como lido, criar e mover,
 * para o servidor clicado, aberto ou não.
 */
export function ServerMenuBody({
  serverId,
  items,
  onClose
}: {
  serverId: string
  items: RailLayoutItem[]
  onClose: () => void
}): React.JSX.Element {
  const data = useServerMenuData(serverId)
  const actions = useServerMenuActions(data)
  const userId = useAuthStore((s) => s.user?.id)
  const canConfigureEvents = Boolean(useEventAccess(serverId)?.configure)
  if (!data || !actions) {
    return <p className="px-2.5 py-2 text-ds-sm text-muted">Carregando…</p>
  }
  const context = serverMenuContext({ access: data.access, userId, canConfigureEvents })
  const settingsSections = settingsSectionsFor(data.access.perms, data.access.isOwner, canConfigureEvents)
  const groups = railMenuGroups(context)
  return (
    <>
      {groups.map((group, index) => (
        <Fragment key={group.join()}>
          {index > 0 && <div role="separator" className="mx-1 my-1 h-px bg-fg/10" />}
          {group.map((item) => (
            <Entry
              key={item}
              item={item}
              serverId={serverId}
              actions={actions}
              items={items}
              onClose={onClose}
              settingsSections={settingsSections}
            />
          ))}
        </Fragment>
      ))}
    </>
  )
}
