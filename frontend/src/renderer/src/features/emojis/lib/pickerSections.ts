import { normalizeSearch } from './baseEmojis'

// As seções do seletor de emojis e figurinhas: um servidor por seção, o atual
// primeiro, e quem pode usar o quê (docs/adr/0052-emojis-de-outros-servidores.md).

/** Por que um item de fora está desabilitado. */
export const EXTERNAL_REASON = 'Você não tem permissão para usar itens de outros servidores aqui.'

export interface PickerServer {
  id: string
  name: string
  icon_url?: string | null
}

export interface ServerSection<T> {
  server: PickerServer
  /** É de outro servidor (na DM, todos são). */
  external: boolean
  items: T[]
}

/**
 * Os servidores da barra, com os que só a lista de itens conhece no fim (a
 * lista de servidores pode ainda não ter chegado).
 */
export function withItemServers(servers: PickerServer[], extra: PickerServer[]): PickerServer[] {
  const known = new Set(servers.map((s) => s.id))
  return [...servers, ...extra.filter((s) => !known.has(s.id))]
}

/** O servidor atual primeiro; os outros na ordem da barra de servidores. */
export function orderServers<S extends { id: string }>(servers: S[], currentId?: string | null): S[] {
  const current = servers.filter((s) => s.id === currentId)
  return current.length ? [...current, ...servers.filter((s) => s.id !== currentId)] : servers
}

function matching<T>(items: T[], nameOf: (item: T) => string, query: string): T[] {
  return query ? items.filter((item) => normalizeSearch(nameOf(item)).includes(query)) : items
}

/**
 * Uma seção por servidor com itens. Sem busca, o servidor atual aparece mesmo
 * vazio (é dali que se adiciona); com busca, só o que achou algo.
 */
export function serverSections<T>({
  servers,
  itemsOf,
  nameOf,
  currentId,
  search
}: {
  servers: PickerServer[]
  itemsOf: (serverId: string) => T[]
  nameOf: (item: T) => string
  currentId?: string | null
  search: string
}): ServerSection<T>[] {
  const query = normalizeSearch(search.trim())
  return orderServers(servers, currentId)
    .map((server) => ({
      server,
      external: server.id !== currentId,
      items: matching(itemsOf(server.id), nameOf, query)
    }))
    .filter((section) => section.items.length > 0 || (!query && section.server.id === currentId))
}

/** A pessoa pode usar itens de fora neste destino? (ver quem decide no servidor) */
export function externalAllowed({
  serverId,
  channelId,
  openServerId,
  rolesLoaded,
  can,
  canInChannel
}: {
  /** Servidor de destino; vazio = DM ou grupo, que não têm cargos. */
  serverId?: string | null
  channelId?: string | null
  openServerId?: string
  rolesLoaded: boolean
  can: () => boolean
  canInChannel: (channelId: string) => boolean
}): boolean {
  if (!serverId) return true
  // Só dá para conferir os cargos do servidor aberto; fora isso, o servidor decide.
  if (serverId !== openServerId || !rolesLoaded) return true
  return channelId ? canInChannel(channelId) : can()
}

/**
 * Os "Usados com frequência": o ranking, sem o que não existe mais (emoji
 * apagado, servidor de que saiu), completado com os padrões até o limite.
 */
export function frequentItems<T>(
  ranked: string[],
  lookup: (key: string) => T | undefined,
  defaults: string[],
  limit: number
): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const key of [...ranked, ...defaults]) {
    if (out.length >= limit) break
    const item = seen.has(key) ? undefined : lookup(key)
    seen.add(key)
    if (item !== undefined) out.push(item)
  }
  return out
}

/** O que o rodapé diz de um item de servidor. */
export interface ItemPreview {
  title: string
  detail?: string
  reason?: string
}

export function itemPreview(title: string, serverName: string | undefined, disabled: boolean): ItemPreview {
  return {
    title,
    detail: serverName ? `de ${serverName}` : undefined,
    reason: disabled ? EXTERNAL_REASON : undefined
  }
}

/** Sem a permissão e com algo de fora na lista, o seletor avisa uma vez, em cima. */
export function externalNotice<T>(allowed: boolean, sections: ServerSection<T>[]): string | undefined {
  if (allowed) return undefined
  return sections.some((s) => s.external && s.items.length > 0) ? EXTERNAL_REASON : undefined
}

const CUSTOM_PREFIX = 'custom:'

/** A chave do emoji personalizado (nos usados com frequência e no rodapé). */
export const customKey = (id: string): string => `${CUSTOM_PREFIX}${id}`

/** O id do emoji personalizado, ou null se a chave é de um emoji Unicode. */
export const customIdOf = (key: string): string | null =>
  key.startsWith(CUSTOM_PREFIX) ? key.slice(CUSTOM_PREFIX.length) : null
