import { create } from 'zustand'
import { getChannelLayout, listChannels, type Channel, type ChannelLayout } from '../api/channels'
import { listServers, type Server } from '../api/servers'

type Status = 'idle' | 'loading' | 'ready' | 'error'

interface ServersState {
  servers: Server[]
  status: Status
  channelsByServer: Record<string, Channel[]>
  /** A organização da barra. Se falhar, a tela mostra os canais por tipo. */
  layoutByServer: Record<string, ChannelLayout | null>
  /** Servidores cuja lista de canais falhou ao carregar (a tela oferece tentar de novo). */
  channelsError: Record<string, boolean>
  load: () => Promise<void>
  loadChannels: (serverId: string) => Promise<void>
  reset: () => void
}

const empty = (): Pick<ServersState, 'servers' | 'status' | 'channelsByServer' | 'layoutByServer' | 'channelsError'> => ({
  servers: [],
  status: 'idle',
  channelsByServer: {},
  layoutByServer: {},
  channelsError: {}
})

/** Sem a organização, a lista ainda funciona: os canais aparecem por tipo. */
async function layoutOrNothing(serverId: string): Promise<ChannelLayout | null> {
  try {
    return (await getChannelLayout(serverId)) ?? null
  } catch {
    return null
  }
}

export const useServersStore = create<ServersState>()((set) => ({
  ...empty(),
  load: async () => {
    set({ status: 'loading' })
    try {
      set({ servers: await listServers(), status: 'ready' })
    } catch {
      set({ status: 'error' })
    }
  },
  loadChannels: async (serverId) => {
    try {
      const [channels, layout] = await Promise.all([listChannels(serverId), layoutOrNothing(serverId)])
      set((s) => ({
        channelsByServer: { ...s.channelsByServer, [serverId]: channels },
        layoutByServer: { ...s.layoutByServer, [serverId]: layout },
        channelsError: { ...s.channelsError, [serverId]: false }
      }))
    } catch {
      set((s) => ({
        channelsByServer: { ...s.channelsByServer, [serverId]: s.channelsByServer[serverId] ?? [] },
        channelsError: { ...s.channelsError, [serverId]: true }
      }))
    }
  },
  reset: () => set(empty())
}))
