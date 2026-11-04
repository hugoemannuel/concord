// Que itens aparecem nos menus da barra de canais (do canal e do servidor).
// Cada regra é uma função pequena; a ordem da tabela é a ordem do menu.

export type ChannelMenuItem =
  'notifications' | 'move-up' | 'move-down' | 'make-primary' | 'edit' | 'permissions' | 'delete'

export interface ChannelMenuContext {
  hasServer: boolean
  isText: boolean
  /** Canal fixo de sistema ("musica", "avisos"): não se edita nem apaga. */
  isSystem: boolean
  /** Canal da sala de um evento: só o evento o cria e apaga (não se edita, apaga nem vira canal principal). */
  isManaged?: boolean
  isPrimary: boolean
  /** Posição do canal na seção (-1 = não achou) e tamanho da seção. */
  index: number
  sectionLength: number
  canManageChannels: boolean
  canManageServer: boolean
  canManageRolesHere: boolean
}

const CHANNEL_RULES: [ChannelMenuItem, (c: ChannelMenuContext) => boolean][] = [
  ['notifications', (c) => c.hasServer && c.isText],
  // Alternativa ao arrastar (teclado/leitor de tela).
  ['move-up', (c) => c.canManageChannels && c.index > 0],
  ['move-down', (c) => c.canManageChannels && c.index >= 0 && c.index < c.sectionLength - 1],
  ['make-primary', (c) => c.canManageServer && c.isText && !c.isPrimary && !c.isManaged],
  ['edit', (c) => c.canManageChannels && !c.isSystem && !c.isManaged],
  ['permissions', (c) => c.canManageRolesHere && !c.isSystem && !c.isManaged],
  ['delete', (c) => c.canManageChannels && !c.isSystem && !c.isManaged]
]

/** Itens do menu "•••" de um canal, na ordem em que aparecem. */
export function channelMenuItems(context: ChannelMenuContext): ChannelMenuItem[] {
  return CHANNEL_RULES.filter(([, shown]) => shown(context)).map(([item]) => item)
}

export type ServerMenuItem =
  | 'invite'
  | 'createChannel'
  | 'createCategory'
  | 'hideMuted'
  | 'profile'
  | 'nickname'
  | 'memberProfile'
  | 'events'
  | 'notifications'
  | 'settings'
  | 'leave'
  | 'delete'

export interface ServerMenuContext {
  hasServer: boolean
  canInvite: boolean
  canManageChannels: boolean
  canChangeOwnNickname: boolean
  canOpenSettings: boolean
  isOwner: boolean
}

const SERVER_RULES: [ServerMenuItem, (c: ServerMenuContext) => boolean][] = [
  // Quem tem CREATE_INVITE convida (por padrão, todo membro).
  ['invite', (c) => c.canInvite],
  // Os mesmos do botão direito na área de canais, para quem usa só o teclado.
  ['createChannel', (c) => c.hasServer && c.canManageChannels],
  ['createCategory', (c) => c.hasServer && c.canManageChannels],
  ['hideMuted', (c) => c.hasServer],
  // O cartão do servidor, como os outros o veem.
  ['profile', (c) => c.hasServer],
  // O próprio apelido neste servidor ("Alterar apelido", todo mundo por padrão).
  ['nickname', (c) => c.canChangeOwnNickname],
  // O perfil neste servidor é de todo membro (CHANGE_NICKNAME só controla o nome).
  ['memberProfile', (c) => c.hasServer],
  // Todo membro vê os eventos e responde; criar exige Gerenciar eventos (dentro do painel).
  ['events', (c) => c.hasServer],
  ['notifications', (c) => c.hasServer],
  ['settings', (c) => c.canOpenSettings],
  // O dono não sai: apaga o servidor.
  ['leave', (c) => !c.isOwner],
  ['delete', (c) => c.isOwner]
]

/** Itens do menu do servidor (cabeçalho da barra), na ordem em que aparecem. */
export function serverMenuItems(context: ServerMenuContext): ServerMenuItem[] {
  return SERVER_RULES.filter(([, shown]) => shown(context)).map(([item]) => item)
}

export type ChannelAreaMenuItem = 'hideMuted' | 'createChannel' | 'createCategory' | 'invite'

export interface ChannelAreaMenuContext {
  canManageChannels: boolean
  canInvite: boolean
}

const AREA_RULES: [ChannelAreaMenuItem, (c: ChannelAreaMenuContext) => boolean][] = [
  ['hideMuted', () => true],
  ['createChannel', (c) => c.canManageChannels],
  ['createCategory', (c) => c.canManageChannels],
  ['invite', (c) => c.canInvite]
]

/** Itens do menu do botão direito na parte vazia da lista de canais, na ordem do menu. */
export function channelAreaMenuItems(context: ChannelAreaMenuContext): ChannelAreaMenuItem[] {
  return AREA_RULES.filter(([, shown]) => shown(context)).map(([item]) => item)
}

/** Linhas e cabeçalhos têm o próprio menu: o da área vale só para o espaço vazio. */
export function isEmptyChannelArea(target: Element): boolean {
  return !target.closest('[data-sidebar-item]')
}
