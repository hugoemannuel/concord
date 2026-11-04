import { onWsEvent } from '../../../shared/api/ws'
import { useServerProfileStore } from '../store/serverProfileStore'
import { useServerTagStore } from '../store/serverTagStore'
import { handleServerProfileEvent, type ServerProfileEventDeps } from './serverProfileEvents'

const liveDeps: ServerProfileEventDeps = {
  setProfile: (serverId, profile) => useServerProfileStore.getState().setProfile(serverId, profile),
  setServerTag: (serverId, tag, reset) => useServerTagStore.getState().setServerTag(serverId, tag, reset),
  setUserTag: (userId, tag, left) => useServerTagStore.getState().setUserTag(userId, tag, left)
}

/** Liga a customização do servidor ao WS. Uma vez, na entrada do app. */
export function startServerProfile(): () => void {
  return onWsEvent((event) => handleServerProfileEvent(event, liveDeps))
}
