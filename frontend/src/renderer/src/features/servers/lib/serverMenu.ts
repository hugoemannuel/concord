// A definição ÚNICA do menu do servidor: que itens existem, quando cada um
// aparece e em que ordem. O menu de dentro (nome do servidor, na barra de
// canais) e o do ícone (botão direito no trilho) leem daqui; cada um só escolhe
// o seu arranjo (INSIDE_ITEMS e RAIL_GROUPS). Visual e ações ficam em
// `hooks/useServerMenu`.
import { Perm } from './permissions'
import type { ServerAccess } from './serverAccess'
import { canOpenServerSettings, visibleServerSections, type ServerSettingsSection } from './serverSettingsNav'

export type ServerMenuItem =
  | 'markRead'
  | 'invite'
  | 'mute'
  | 'notifications'
  | 'settings'
  | 'level'
  | 'profile'
  | 'nickname'
  | 'memberProfile'
  | 'createChannel'
  | 'createCategory'
  | 'events'
  | 'moveTo'
  | 'leave'
  | 'delete'

export interface ServerMenuContext {
  hasServer: boolean
  canInvite: boolean
  canChangeOwnNickname: boolean
  canOpenSettings: boolean
  /** Gerenciar canais: criar canal e categoria. */
  canManageChannels: boolean
  isOwner: boolean
}

const SERVER_RULES: Record<ServerMenuItem, (c: ServerMenuContext) => boolean> = {
  markRead: (c) => c.hasServer,
  // Quem tem CREATE_INVITE convida (por padrão, todo membro).
  invite: (c) => c.canInvite,
  mute: (c) => c.hasServer,
  notifications: (c) => c.hasServer,
  settings: (c) => c.canOpenSettings,
  // O detalhamento do nível do servidor, aberto a todo membro.
  level: (c) => c.hasServer,
  // O cartão do servidor, como os outros o veem.
  profile: (c) => c.hasServer,
  // O próprio apelido neste servidor ("Alterar apelido", todo mundo por padrão).
  nickname: (c) => c.canChangeOwnNickname,
  // O perfil neste servidor é de todo membro (CHANGE_NICKNAME só controla o nome).
  memberProfile: (c) => c.hasServer,
  createChannel: (c) => c.canManageChannels,
  createCategory: (c) => c.canManageChannels,
  // Todo membro vê os eventos e responde; criar exige Gerenciar eventos (dentro do painel).
  events: (c) => c.hasServer,
  moveTo: (c) => c.hasServer,
  // O dono não sai: apaga o servidor.
  leave: (c) => !c.isOwner,
  delete: (c) => c.isOwner
}

/** O arranjo do menu de dentro: uma lista só, nesta ordem. */
const INSIDE_ITEMS: ServerMenuItem[] = [
  'invite',
  'profile',
  'nickname',
  'memberProfile',
  'events',
  'notifications',
  'settings',
  'leave',
  'delete'
]

/**
 * O arranjo do menu do ícone: grupos separados por divisória, como no Discord.
 * Para acrescentar uma linha (ex.: "Ocultar canais silenciados"), ponha o id em
 * `ServerMenuItem`, a regra em SERVER_RULES, o visual/ação em `useServerMenu` e
 * o id no grupo certo aqui (ele entra no grupo de silenciar/notificações).
 */
const RAIL_GROUPS: ServerMenuItem[][] = [
  ['markRead'],
  ['invite'],
  ['mute', 'notifications'],
  ['settings', 'level', 'profile', 'nickname', 'memberProfile'],
  ['createChannel', 'createCategory', 'events'],
  ['moveTo'],
  ['leave', 'delete']
]

function shown(items: ServerMenuItem[], context: ServerMenuContext): ServerMenuItem[] {
  return items.filter((item) => SERVER_RULES[item](context))
}

/** Itens do menu do servidor (cabeçalho da barra), na ordem em que aparecem. */
export function serverMenuItems(context: ServerMenuContext): ServerMenuItem[] {
  return shown(INSIDE_ITEMS, context)
}

/** Grupos do menu do ícone; grupo sem itens some. */
export function railMenuGroups(context: ServerMenuContext): ServerMenuItem[][] {
  return RAIL_GROUPS.map((group) => shown(group, context)).filter((group) => group.length > 0)
}

/** As seções das configurações que a pessoa pode abrir (o submenu do ícone). */
export function settingsSectionsFor(
  perms: number,
  isOwner: boolean,
  canConfigureEvents: boolean
): ServerSettingsSection[] {
  return visibleServerSections(perms, isOwner, canConfigureEvents)
}



/**
 * O contexto das regras para `access` (as permissões no servidor do menu).
 * Sem `access` (servidor ainda não carregou) só vale o que não depende dele.
 */
export function serverMenuContext(input: {
  access: ServerAccess | null
  userId: string | undefined
  canConfigureEvents: boolean
}): ServerMenuContext {
  const { access, userId, canConfigureEvents } = input
  return {
    hasServer: access !== null,
    canInvite: access?.can(Perm.CREATE_INVITE) ?? false,
    canChangeOwnNickname: Boolean(access && userId && access.canChangeNickname(userId)),
    canOpenSettings: access ? canOpenServerSettings(access.perms, access.isOwner, canConfigureEvents) : false,
    canManageChannels: access?.can(Perm.MANAGE_CHANNELS) ?? false,
    isOwner: access?.isOwner ?? false
  }
}
