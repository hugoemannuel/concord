import { useCallStore } from '../../call/store/callStore'
import { useServerStore } from '../../servers/store/serverStore'
import { personName } from '../lib/castigo'

/** Nome de quem está na call ou no servidor aberto (para a votação). */
export function useCastigoNames(): (userId: string) => string {
  const participants = useCallStore((s) => s.participants)
  const members = useServerStore((s) => s.currentMembers)
  return (userId) => personName(userId, participants, members)
}
