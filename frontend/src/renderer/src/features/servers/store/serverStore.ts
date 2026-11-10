import { create } from 'zustand'
import type { Server, ServerMember } from '../api/servers'
import type { Channel, ChannelType, CreateChannelOptions } from '../api/channels'
import type { Role } from '../lib/permissions'
import { useAuthStore } from '../../auth/store/authStore'
import { sessionGuard } from '../../auth/lib/sessionGuard'
import {
  listServers,
  createServer as apiCreateServer,
  updateServer as apiUpdateServer,
  uploadServerIcon,
  removeServerIcon,
  deleteServer as apiDeleteServer,
  kickMember as apiKickMember,
  leaveServer as apiLeaveServer,
  banMember as apiBanMember,
  setMemberNickname as apiSetMemberNickname
} from '../api/servers'
import {
  createRole as apiCreateRole,
  updateRole as apiUpdateRole,
  deleteRole as apiDeleteRole,
  reorderRoles as apiReorderRoles,
  addMemberRole as apiAddMemberRole,
  removeMemberRole as apiRemoveMemberRole,
  type RoleInput
} from '../api/roles'
import {
  createChannel as apiCreateChannel,
  deleteChannel as apiDeleteChannel,
  reorderChannels as apiReorderChannels
} from '../api/channels'
import { applyChannelOrder } from '../lib/channelOrder'
import {
  findReorderSection,
  isOwnReorderEcho,
  reorderSection,
  trackOwnReorderRequest
} from '../lib/channelReorderQueue'
import { removeRole, sortRoles, stripRoleFromMembers, upsertRole } from '../lib/roleList'
import { withNickname } from '../lib/serverNames'
import { serverViewActions, stashCurrentView } from './serverViewLoad'
import { serverViewCache } from '../lib/serverViewCache'
import { IDLE_SERVERS } from './serverIdle'

export interface ServerState {
  servers: Server[]
  currentServer: Server | null
  currentMembers: ServerMember[]
  /** Cargos do servidor aberto, do mais alto para o mais baixo (@everyone por último). */
  roles: Role[]
  channels: Channel[]
  /**
   * serverId -> userId -> apelido. Fica guardado ao trocar de servidor: a
   * call (palco e overlay) pode ser de outro servidor que não o aberto.
   */
  nicknames: Record<string, Record<string, string>>
  loading: boolean
  /**
   * A lista de servidores já respondeu uma vez (com sucesso ou não). Só a
   * primeira carga mostra o skeleton; as seguintes trocam os dados por baixo.
   */
  serversLoaded: boolean
  /** Servidor cujos canais já chegaram (`channels` é o do anterior até lá). */
  channelsLoadedFor: string | null
  fetchServers: () => Promise<void>
  selectServer: (id: string) => Promise<void>
  /**
   * Relê membros, cargos e canais do servidor aberto sem a tela de carregando
   * (permissões mudaram: cargo novo, canal virou privado…).
   */
  refreshServer: (serverId: string) => Promise<void>
  fetchChannels: (serverId: string) => Promise<void>
  addServer: (name: string, icon_url?: string) => Promise<Server>
  createChannel: (
    serverId: string,
    name: string,
    type?: ChannelType,
    options?: CreateChannelOptions
  ) => Promise<void>
  deleteChannel: (serverId: string, channelId: string) => Promise<void>
  /**
   * Nova ordem de uma seção: aplica na hora e manda ao servidor; se ele
   * recusar, volta a ordem de antes e repassa o erro.
   */
  reorderChannels: (serverId: string, type: ChannelType, channelIds: string[]) => Promise<void>
  /** Aplica uma ordem na lista local (sem falar com o servidor). */
  applyChannelOrder: (serverId: string, type: ChannelType, channelIds: string[]) => void
  /**
   * Ordem que chegou pelo WS (channel:reorder). Ignora o eco das próprias
   * reordenações; com uma nossa a caminho, adia e ressincroniza no fim.
   */
  receiveChannelOrder: (
    serverId: string,
    type: ChannelType,
    channelIds: string[],
    requestId?: string
  ) => void
  updateServer: (serverId: string, name: string) => Promise<void>
  /** Troca o ícone por upload (null tira). O servidor avisa os outros com server:update. */
  setServerIcon: (
    serverId: string,
    icon: { file: Blob; staticFrame?: Blob } | null
  ) => Promise<void>
  deleteServer: (serverId: string) => Promise<void>
  updateLocalServer: (server: Server) => void
  removeLocalServer: (serverId: string) => void
  addMember: (serverId: string, member: ServerMember) => void
  removeMember: (serverId: string, userId: string) => void
  /** Cargo mudou (ex.: virou moderador). */
  updateMember: (serverId: string, member: ServerMember) => void
  /** Cargos de um membro mudaram (evento server:member:roles). */
  setMemberRoleIds: (serverId: string, userId: string, roleIds: string[]) => void
  /** Apelido de um membro mudou (evento server:member:nickname ou resposta da API). */
  setMemberNickname: (serverId: string, userId: string, nickname: string | null) => void
  /** Muda o apelido no servidor ("" tira) e já mostra o novo. */
  changeNickname: (serverId: string, userId: string, nickname: string) => Promise<void>
  /** Cargos do servidor (resposta da API ou evento role:reorder). */
  setRoles: (serverId: string, roles: Role[]) => void
  upsertLocalRole: (serverId: string, role: Role) => void
  removeLocalRole: (serverId: string, roleId: string) => void
  createRole: (serverId: string, input: RoleInput) => Promise<Role>
  updateRole: (serverId: string, roleId: string, input: RoleInput) => Promise<Role>
  deleteRole: (serverId: string, roleId: string) => Promise<void>
  reorderRoles: (serverId: string, roleIds: string[]) => Promise<void>
  addMemberRole: (serverId: string, userId: string, roleId: string) => Promise<void>
  removeMemberRole: (serverId: string, userId: string, roleId: string) => Promise<void>
  kickMember: (serverId: string, userId: string) => Promise<void>
  banMember: (serverId: string, userId: string, reason?: string) => Promise<void>
  leaveServer: (serverId: string) => Promise<void>
  clearCurrentServer: () => void
  reset: () => void
}


const refetchOnFocus = (): void => {
  if (!useAuthStore.getState().accessToken) return
  useServerStore.getState().fetchServers()
}

if (typeof window !== 'undefined') {
  window.addEventListener('focus', refetchOnFocus)
}

/** Troca o apelido no mapa do servidor (null tira); sem mudança, não mexe no store. */
function putNickname(serverId: string, userId: string, nickname: string | null): void {
  const all = useServerStore.getState().nicknames
  const current = all[serverId]
  if (!current && !nickname) return
  const next = withNickname(current ?? {}, userId, nickname)
  if (next !== current) useServerStore.setState({ nicknames: { ...all, [serverId]: next } })
}

export const useServerStore = create<ServerState>()((set, get) => ({
  ...IDLE_SERVERS,
  fetchServers: async () => {
    const sameSession = sessionGuard()
    try {
      const servers = await listServers()
      if (!sameSession()) return
      set({ servers: Array.isArray(servers) ? servers : [], serversLoaded: true })
    } catch {
      if (sameSession()) set({ servers: [], serversLoaded: true })
    }
  },
  ...serverViewActions(set, get),
  addServer: async (name: string, icon_url?: string) => {
    const newServer = await apiCreateServer({ name, icon_url })
    set({ servers: [...get().servers, newServer] })
    return newServer
  },
  createChannel: async (serverId, name, type, options) => {
    await apiCreateChannel(serverId, name, type, options)
    await get().fetchChannels(serverId)
  },
  deleteChannel: async (serverId: string, channelId: string) => {
    await apiDeleteChannel(serverId, channelId)
    await get().fetchChannels(serverId)
  },
  reorderChannels: async (serverId, type, channelIds) => {
    const section = reorderSection(serverId, type)
    const previous = get()
      .channels.filter((c) => (c.type ?? 'text') === type)
      .map((c) => c.id)
    const generation = ++section.generation
    get().applyChannelOrder(serverId, type, channelIds)

    const requestId = trackOwnReorderRequest()

    section.inFlight++
    const sent = section.queue.then(() => apiReorderChannels(serverId, type, channelIds, requestId))
    section.queue = sent.catch(() => {})
    try {
      await sent
    } catch (err) {
      // Só volta se nada mais novo foi feito depois; de todo jeito busca a
      // lista do servidor (a nossa pode estar velha: canal criado/apagado).
      if (section.generation === generation) get().applyChannelOrder(serverId, type, previous)
      section.stale = true
      throw err
    } finally {
      section.inFlight--
      if (section.inFlight === 0 && section.stale) {
        section.stale = false
        void get().fetchChannels(serverId)
      }
    }
  },
  receiveChannelOrder: (serverId, type, channelIds, requestId) => {
    if (isOwnReorderEcho(requestId)) return
    const section = findReorderSection(serverId, type)
    if (section && section.inFlight > 0) {
      section.stale = true
      return
    }
    get().applyChannelOrder(serverId, type, channelIds)
  },
  applyChannelOrder: (serverId, type, channelIds) => {
    if (get().currentServer?.id !== serverId) return
    const channels = applyChannelOrder(get().channels, type, channelIds)
    if (channels !== get().channels) set({ channels })
  },
  updateServer: async (serverId: string, name: string) => {
    get().updateLocalServer(await apiUpdateServer(serverId, { name }))
  },
  setServerIcon: async (serverId: string, icon) => {
    get().updateLocalServer(
      icon
        ? await uploadServerIcon(serverId, icon.file, icon.staticFrame)
        : await removeServerIcon(serverId)
    )
  },
  deleteServer: async (serverId: string) => {
    await apiDeleteServer(serverId)
    set({ servers: get().servers.filter((s) => s.id !== serverId) })
    if (get().currentServer?.id === serverId) {
      set({ currentServer: null, currentMembers: [], roles: [], channels: [] })
    }
  },
  updateLocalServer: (server) => {
    set({
      servers: get().servers.map((s) => (s.id === server.id ? { ...s, ...server } : s)),
      currentServer:
        get().currentServer?.id === server.id
          ? { ...get().currentServer, ...server }
          : get().currentServer
    })
  },
  removeLocalServer: (serverId) => {
    serverViewCache.forget(serverId)
    const nicknames = { ...get().nicknames }
    delete nicknames[serverId]
    set({
      servers: get().servers.filter((s) => s.id !== serverId),
      currentServer: get().currentServer?.id === serverId ? null : get().currentServer,
      currentMembers: get().currentServer?.id === serverId ? [] : get().currentMembers,
      roles: get().currentServer?.id === serverId ? [] : get().roles,
      channels: get().currentServer?.id === serverId ? [] : get().channels,
      nicknames
    })
  },
  // Entrar, sair, ser expulso ou atualizar também acertam o mapa de apelidos
  // (de qualquer servidor, não só o aberto): o chat, o "digitando", a voz e o
  // overlay leem dele, e o apelido some do banco junto com o membro.
  addMember: (serverId, member) => {
    putNickname(serverId, member.user_id, member.nickname ?? null)
    if (get().currentServer?.id === serverId) {
      const exists = get().currentMembers.some((m) => m.user_id === member.user_id)
      if (!exists) {
        set({ currentMembers: [...get().currentMembers, member] })
      }
    }
  },
  updateMember: (serverId, member) => {
    if ('nickname' in member) putNickname(serverId, member.user_id, member.nickname ?? null)
    if (get().currentServer?.id === serverId) {
      set({
        currentMembers: get().currentMembers.map((m) =>
          m.user_id === member.user_id ? { ...m, ...member } : m
        )
      })
    }
  },
  removeMember: (serverId, userId) => {
    putNickname(serverId, userId, null)
    if (get().currentServer?.id === serverId) {
      set({ currentMembers: get().currentMembers.filter((m) => m.user_id !== userId) })
    }
  },
  setMemberRoleIds: (serverId, userId, roleIds) => {
    if (get().currentServer?.id !== serverId) return
    set({
      currentMembers: get().currentMembers.map((m) =>
        m.user_id === userId ? { ...m, role_ids: roleIds } : m
      )
    })
  },
  setMemberNickname: (serverId, userId, nickname) => {
    putNickname(serverId, userId, nickname)
    if (get().currentServer?.id !== serverId) return
    set({
      currentMembers: get().currentMembers.map((m) =>
        m.user_id === userId ? { ...m, nickname } : m
      )
    })
  },
  changeNickname: async (serverId, userId, nickname) => {
    const res = await apiSetMemberNickname(serverId, userId, nickname)
    get().setMemberNickname(serverId, userId, res.nickname)
  },
  setRoles: (serverId, roles) => {
    if (get().currentServer?.id === serverId) set({ roles: sortRoles(roles) })
  },
  upsertLocalRole: (serverId, role) => {
    if (get().currentServer?.id === serverId) set({ roles: upsertRole(get().roles, role) })
  },
  removeLocalRole: (serverId, roleId) => {
    if (get().currentServer?.id !== serverId) return
    set({
      roles: removeRole(get().roles, roleId),
      currentMembers: stripRoleFromMembers(get().currentMembers, roleId)
    })
  },
  createRole: async (serverId, input) => {
    const role = await apiCreateRole(serverId, input)
    // O novo cargo empurra os outros uma posição acima: relê a lista toda.
    get().upsertLocalRole(serverId, role)
    void get().refreshServer(serverId)
    return role
  },
  updateRole: async (serverId, roleId, input) => {
    const role = await apiUpdateRole(serverId, roleId, input)
    get().upsertLocalRole(serverId, role)
    return role
  },
  deleteRole: async (serverId, roleId) => {
    await apiDeleteRole(serverId, roleId)
    get().removeLocalRole(serverId, roleId)
  },
  reorderRoles: async (serverId, roleIds) => {
    const roles = await apiReorderRoles(serverId, roleIds)
    get().setRoles(serverId, roles)
  },
  addMemberRole: async (serverId, userId, roleId) => {
    const res = await apiAddMemberRole(serverId, userId, roleId)
    get().setMemberRoleIds(serverId, userId, res.role_ids)
  },
  removeMemberRole: async (serverId, userId, roleId) => {
    const res = await apiRemoveMemberRole(serverId, userId, roleId)
    get().setMemberRoleIds(serverId, userId, res.role_ids)
  },
  kickMember: async (serverId, userId) => {
    await apiKickMember(serverId, userId)
    get().removeMember(serverId, userId)
  },
  banMember: async (serverId, userId, reason) => {
    await apiBanMember(serverId, userId, reason)
    get().removeMember(serverId, userId)
  },
  leaveServer: async (serverId) => {
    await apiLeaveServer(serverId)
    get().removeLocalServer(serverId)
  },
  clearCurrentServer: () => {
    stashCurrentView(get)
    set({
      currentServer: null,
      currentMembers: [],
      roles: [],
      channels: [],
      channelsLoadedFor: null
    })
  },
  reset: () => {
    serverViewCache.clear()
    set(IDLE_SERVERS)
  }
}))
