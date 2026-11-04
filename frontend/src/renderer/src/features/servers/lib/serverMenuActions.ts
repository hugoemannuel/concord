import type { ChannelType } from '../api/channels'
import type { ServerMember } from '../api/servers'
import type { ServerMenuItem } from './serverMenu'
import { serverDisplayName } from './serverNames'
import type { ServerSettingsSectionId } from './serverSettingsNav'

export interface NicknameRequest {
  serverId: string
  userId: string
  name: string
  nickname: string | null
  displayName: string
  self: boolean
}

/** Tudo de que as ações do menu precisam; o hook liga cada uma ao store real. */
export interface ServerMenuDeps {
  /** O servidor do menu (o clicado no trilho, ou o aberto no menu de dentro). */
  server: { id: string; name: string }
  user: { id: string; username?: string; display_name?: string } | undefined
  /** Membros DESTE servidor (não os do aberto). */
  members: ServerMember[]
  /**
   * Roda `run` com este servidor aberto: na hora se já é o aberto; senão abre
   * o servidor e roda quando ele chegar (convite, configurações, criar canal).
   */
  onServer: (run: () => void) => void
  askConfirm: (kind: 'leave' | 'delete-server') => void
  askCategory: () => void
  openCard: (serverId: string) => void
  openLevel: (serverId: string) => void
  openEvents: (serverId: string) => void
  openNotify: (target: { serverId: string; name: string }) => void
  openMemberProfile: (serverId: string) => void
  askNickname: (request: NicknameRequest) => void
  markRead: (serverId: string) => void
  openInvite: () => void
  openSettings: (section?: ServerSettingsSectionId) => void
  openCreateChannel: (type: ChannelType) => void
}

export type ServerMenuActions = Record<
  Exclude<ServerMenuItem, 'mute' | 'moveTo'>,
  () => void
> & { openSettingsSection: (section: ServerSettingsSectionId) => void }

function askOwnNickname(d: ServerMenuDeps): void {
  if (!d.user) return
  const mine = d.members.find((m) => m.user_id === d.user?.id)
  d.askNickname({
    serverId: d.server.id,
    userId: d.user.id,
    name: serverDisplayName(mine, d.user),
    nickname: mine?.nickname ?? null,
    displayName: d.user.display_name || d.user.username || '',
    self: true
  })
}

/**
 * As ações do menu do servidor, todas sobre `deps.server`. Mesma tabela para o
 * menu de dentro e para o do ícone; "silenciar" e "mover para…" são submenus
 * (só do ícone) e têm as próprias escolhas.
 */
export function buildServerMenuActions(d: ServerMenuDeps): ServerMenuActions {
  const id = d.server.id
  const openSettingsSection = (section?: ServerSettingsSectionId): void =>
    d.onServer(() => d.openSettings(section))
  return {
    markRead: () => d.markRead(id),
    invite: () => d.onServer(d.openInvite),
    notifications: () => d.openNotify({ serverId: id, name: d.server.name }),
    settings: () => openSettingsSection(),
    openSettingsSection,
    level: () => d.openLevel(id),
    profile: () => d.openCard(id),
    nickname: () => askOwnNickname(d),
    memberProfile: () => d.openMemberProfile(id),
    createChannel: () => d.onServer(() => d.openCreateChannel('text')),
    createCategory: d.askCategory,
    // O painel de eventos usa os canais do servidor aberto (criar evento): abre o servidor antes.
    events: () => d.onServer(() => d.openEvents(id)),
    leave: () => d.askConfirm('leave'),
    delete: () => d.askConfirm('delete-server')
  }
}
