import { useMemo } from 'react'
import { voiceActivityByServer } from '../lib/voiceList'
import type { VoiceMember } from '../lib/voiceServer'
import { useCallStore } from '../store/callStore'
import { useServerCallsLoad } from './useServerCallsLoad'

// Quem está em canal de voz, por servidor (inclusive quando eu não estou na chamada).
// Só entram os servidores com gente: `activity.has(id)` diz se há call ativa.
export function useServersVoiceActivity(serverIds: string[]): Map<string, VoiceMember[]> {
  useServerCallsLoad(serverIds)
  const serverCalls = useCallStore((s) => s.serverCalls)
  const key = serverIds.join(',')
  return useMemo(
    () => voiceActivityByServer(serverCalls, key ? key.split(',') : []),
    [serverCalls, key]
  )
}
