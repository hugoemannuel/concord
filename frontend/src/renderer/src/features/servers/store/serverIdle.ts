import type { ServerState } from './serverStore'

// Estado inicial dos servidores, tirado do serverStore (god file): é também o que o reset (logout) restaura.
export const IDLE_SERVERS = {
  servers: [],
  currentServer: null,
  currentMembers: [],
  roles: [],
  channels: [],
  nicknames: {},
  loading: false,
  serversLoaded: false,
  channelsLoadedFor: null
} satisfies Partial<ServerState>
