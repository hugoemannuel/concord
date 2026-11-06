import type { StoreApi } from 'zustand'
import { getServer } from '../api/servers'
import { listChannels as apiListChannels } from '../api/channels'
import { useAuthStore } from '../../auth/store/authStore'
import { sessionGuard } from '../../auth/lib/sessionGuard'
import { sortRoles } from '../lib/roleList'
import { nicknameMap } from '../lib/serverNames'
import { serverViewCache } from '../lib/serverViewCache'
import type { ServerState } from './serverStore'

// Carregar a tela de um servidor (o servidor, membros, cargos e canais),
// separado do serverStore, que só junta as ações.

/** Conta as chamadas de selectServer: só a mais recente grava o resultado. */
let selectSeq = 0
/** Idem para a busca de canais (a resposta velha chega depois da nova). */
let channelsSeq = 0

type Set = StoreApi<ServerState>['setState']
type Get = StoreApi<ServerState>['getState']

const currentUserId = (): string | undefined => useAuthStore.getState().user?.id

/**
 * De quem é a tela aberta: a conta que a carregou. Sessão encerrada à força
 * (sem reset do store) deixa a tela da conta anterior aberta; ela não pode ir
 * para o cache da conta nova.
 */
let viewOwner: string | undefined

/** Guarda a tela do servidor aberto (já com o que os eventos mudaram) antes de sair dele. */
export function stashCurrentView(get: Get): void {
  const { currentServer, currentMembers, roles, channels, channelsLoadedFor } = get()
  if (!currentServer || !viewOwner || viewOwner !== currentUserId()) return
  serverViewCache.remember(viewOwner, {
    server: currentServer,
    members: currentMembers,
    roles,
    channels: channelsLoadedFor === currentServer.id ? channels : []
  })
}

/** Mostra a última tela vista de id, se houver; true = mostrou. */
function showCachedView(id: string, set: Set): boolean {
  const view = serverViewCache.recall(currentUserId(), id)
  if (!view) return false
  viewOwner = currentUserId()
  set({
    currentServer: view.server,
    currentMembers: view.members,
    roles: view.roles,
    channels: view.channels,
    channelsLoadedFor: view.channels.length > 0 ? id : null,
    // Um servidor aberto antes, ainda sem resposta, deixou o "carregando".
    loading: false
  })
  return true
}

/** Leitura nova de id chegou para a conta atual. */
function loadedFresh(id: string): void {
  viewOwner = currentUserId()
  serverViewCache.markFresh(id)
}

export function serverViewActions(
  set: Set,
  get: Get
): Pick<ServerState, 'selectServer' | 'refreshServer' | 'fetchChannels'> {
  return {
    selectServer: async (id: string) => {
      const sameSession = sessionGuard()
      const seq = ++selectSeq
      // Já é o servidor na tela, ou ele já foi visto: mostra o que há e
      // busca por baixo. O "carregando" (que tira a tela toda, modal junto) é
      // só para abrir um servidor pela primeira vez.
      const refreshing = get().currentServer?.id === id
      if (!refreshing) {
        stashCurrentView(get)
        if (!showCachedView(id, set)) set({ loading: true })
      }
      try {
        const res = await getServer(id)
        if (!sameSession() || seq !== selectSeq) return
        loadedFresh(id)
        set({
          currentServer: res.server,
          currentMembers: res.members,
          roles: sortRoles(res.roles ?? []),
          nicknames: { ...get().nicknames, [id]: nicknameMap(res.members) }
        })
      } catch (err) {
        if (!sameSession() || seq !== selectSeq) return
        serverViewCache.forget(id)
        if (!refreshing) set({ currentServer: null, currentMembers: [], roles: [] })
        throw err
      } finally {
        if (seq === selectSeq) set({ loading: false })
      }
    },
    refreshServer: async (serverId: string) => {
      const sameSession = sessionGuard()
      try {
        const [res, channels] = await Promise.all([getServer(serverId), apiListChannels(serverId)])
        if (!sameSession() || get().currentServer?.id !== serverId) return
        loadedFresh(serverId)
        set({
          currentServer: res.server,
          currentMembers: res.members,
          roles: sortRoles(res.roles ?? []),
          channels: Array.isArray(channels) ? channels : [],
          channelsLoadedFor: serverId,
          nicknames: { ...get().nicknames, [serverId]: nicknameMap(res.members) }
        })
      } catch {
        // Sem acesso (foi expulso/banido) ou rede fora: o evento server:removed
        // cuida do primeiro caso e o próximo evento tenta de novo.
      }
    },
    fetchChannels: async (serverId: string) => {
      const sameSession = sessionGuard()
      const seq = ++channelsSeq
      try {
        const channels = await apiListChannels(serverId)
        if (!sameSession() || seq !== channelsSeq) return
        set({ channels: Array.isArray(channels) ? channels : [], channelsLoadedFor: serverId })
      } catch {
        if (sameSession() && seq === channelsSeq) {
          set({ channels: [], channelsLoadedFor: serverId })
        }
      }
    }
  }
}
