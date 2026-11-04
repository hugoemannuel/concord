import { useEffect } from 'react'
import { useServerStore } from '../store/serverStore'
import { useServerLayoutStore } from '../store/serverLayoutStore'
import { useInviteStore } from '../store/inviteStore'
import { useProposalStore } from '../../proposals/store/proposalStore'
import { useChatStore } from '../../chat/store/chatStore'

// Carrega o que a barra lateral mostra (servidores, layout, convites, propostas, canais)
// e mantém a escuta em tempo real de cada servidor enquanto ela está montada.
export function useServerRailSync(): void {
  const servers = useServerStore((s) => s.servers)
  const fetchServers = useServerStore((s) => s.fetchServers)
  const fetchLayout = useServerLayoutStore((s) => s.fetchLayout)
  const fetchInvites = useInviteStore((s) => s.fetchInvites)
  const fetchProposals = useProposalStore((s) => s.fetchProposals)
  const fetchProposalMentions = useProposalStore((s) => s.fetchMentions)
  const fetchChannelsForServers = useChatStore((s) => s.fetchChannelsForServers)

  useEffect(() => {
    fetchServers()
    void fetchLayout()
  }, [fetchServers, fetchLayout])

  useEffect(() => {
    fetchInvites()
  }, [fetchInvites])

  useEffect(() => {
    fetchProposals()
  }, [fetchProposals])

  useEffect(() => {
    void fetchProposalMentions()
  }, [fetchProposalMentions])

  useEffect(() => {
    if (servers.length > 0) {
      fetchChannelsForServers(servers.map((s) => s.id))
    }
  }, [servers, fetchChannelsForServers])

  useEffect(() => {
    const ids = servers.map((s) => s.id)
    const chat = useChatStore.getState()
    ids.forEach((id) => chat.openServer(id))
    return () => {
      ids.forEach((id) => chat.closeServer(id))
    }
  }, [servers])
}
