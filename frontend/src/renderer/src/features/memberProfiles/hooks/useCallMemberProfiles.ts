import { useCallStore } from '../../call/store/callStore'
import type { MemberProfile } from '../lib/memberProfile'
import { useMemberProfileStore } from '../store/memberProfileStore'

/** Os perfis do servidor da call em que estou; call de DM: undefined. */
export function useCallMemberProfiles(): Record<string, MemberProfile> | undefined {
  const serverId = useCallStore((s) => (s.type === 'channel' ? s.serverId : null))
  return useMemberProfileStore((s) => (serverId ? s.byServer[serverId] : undefined))
}
