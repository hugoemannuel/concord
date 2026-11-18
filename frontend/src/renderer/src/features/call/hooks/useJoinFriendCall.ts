import { useNavigate } from 'react-router-dom'
import { showToast } from '../../../shared/store/toastStore'
import { joinFriendCall } from '../lib/joinFriendCall'
import { useCallStore } from '../store/callStore'

function inDmCall(): boolean {
  const s = useCallStore.getState()
  return s.status !== 'idle' && s.type !== 'channel'
}

function landed(channelId: string): boolean {
  const s = useCallStore.getState()
  return (s.status !== 'idle' && s.channelId === channelId) || s.knock?.channelId === channelId
}

/** Clique no card de "Ativo agora": entra na call do canal do amigo. */
export function useJoinFriendCall(): (target: { serverId: string; channelId: string }) => void {
  const navigate = useNavigate()
  const join = useCallStore((s) => s.joinVoiceChannel)
  return (target) => {
    void joinFriendCall(target, {
      join,
      navigate,
      toastError: (msg) => showToast.error(msg),
      inDmCall,
      landed
    })
  }
}
