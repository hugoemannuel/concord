import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCallStore } from '../../call/store/callStore'
import { useAuthStore } from '../../auth/store/authStore'
import { voiceMembers } from '../../call/lib/recentArrivals'
import { loadServerCalls } from '../../call/hooks/useServerCallsLoad'
import { useRecentArrivalsStore } from '../../call/store/recentArrivalsStore'
import { useLevelStore } from '../../levels/store/levelStore'
import { voiceUserIdsKey } from '../lib/channelSidebar'

/**
 * Quem está nos canais de voz do servidor aberto. A lista é lida ao abrir o
 * servidor (a do selo "Chegou" parte dela) e segue pelos eventos call:channel_*
 * (ver useServerCallsLoad, que também relê na reconexão); os níveis de quem
 * está em voz vêm num pedido só; e o pedido para entrar numa sala trancada,
 * quando aceito, leva para o canal.
 */
export function useServerCallsSync(serverId: string | undefined): void {
  const navigate = useNavigate()
  const usersKey = useCallStore((s) => voiceUserIdsKey(s.serverCalls))
  const admittedChannelId = useCallStore((s) => s.admittedChannelId)
  const clearAdmittedChannel = useCallStore((s) => s.clearAdmittedChannel)
  const ensureLevels = useLevelStore((s) => s.ensureLevels)

  useEffect(() => {
    if (!serverId) return
    let cancelled = false
    void loadServerCalls(serverId).then((calls) => {
      if (cancelled || !calls) return
      useRecentArrivalsStore
        .getState()
        .ingest(serverId, voiceMembers(calls), useAuthStore.getState().user?.id)
    })
    return () => {
      cancelled = true
    }
  }, [serverId])

  useEffect(() => {
    if (usersKey) ensureLevels(usersKey.split(','))
  }, [usersKey, ensureLevels])

  useEffect(() => {
    if (admittedChannelId && serverId) {
      navigate(`/servers/${serverId}/channels/${admittedChannelId}`)
      clearAdmittedChannel()
    }
  }, [admittedChannelId, serverId, navigate, clearAdmittedChannel])
}
