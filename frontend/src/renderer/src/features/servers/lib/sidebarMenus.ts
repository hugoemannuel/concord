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
