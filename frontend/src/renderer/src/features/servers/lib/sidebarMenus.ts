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

/** Para onde as setas levam o foco no menu (dá a volta nas pontas); sem seta, null. */
export function nextMenuFocus(key: string, current: number, total: number): number | null {
  if (key !== 'ArrowDown' && key !== 'ArrowUp') return null
  const next = key === 'ArrowDown' ? current + 1 : current - 1
  return (next + total) % total
}
