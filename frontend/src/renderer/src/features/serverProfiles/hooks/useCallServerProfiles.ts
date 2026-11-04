import { useCallStore } from '../../call/store/callStore'
import type { ServerProfile } from '../lib/serverProfile'
import { useServerProfileStore } from '../store/serverProfileStore'

/** Os perfis do servidor da call em que estou; call de DM: undefined. */
export function useCallServerProfiles(): Record<string, ServerProfile> | undefined {
  const serverId = useCallStore((s) => (s.type === 'channel' ? s.serverId : null))
  return useServerProfileStore((s) => (serverId ? s.byServer[serverId] : undefined))
}
