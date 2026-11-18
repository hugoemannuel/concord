import { useMemo } from 'react'
import type { PublicUser } from '../../auth/store/authStore'
import { useCallStore } from '../../call/store/callStore'
import { useJoinFriendCall } from '../../call/hooks/useJoinFriendCall'
import { useServerStore } from '../../servers/store/serverStore'
import { FriendsActivity } from '../../activity/components/FriendsActivity'
import { friendsInVoice } from '../lib/onlineFriends'
import ActiveVoiceFriendCard from './ActiveVoiceFriendCard'

/** Coluna "Ativo agora": amigos em canais de voz que o app conhece; clicar entra na call. */
export default function ActiveNow({ friends }: { friends: PublicUser[] }): React.JSX.Element {
  const serverCalls = useCallStore((s) => s.serverCalls)
  const servers = useServerStore((s) => s.servers)
  const join = useJoinFriendCall()
  const inVoice = useMemo(() => friendsInVoice(friends, serverCalls), [serverCalls, friends])

  return (
    <aside className="hidden w-[360px] shrink-0 border-l border-subtle px-4 py-4 xl:block">
      <FriendsActivity friends={friends} />
      <h2 className="text-ds-lg font-bold text-strong">Ativo agora</h2>
      {inVoice.length === 0 ? (
        <div className="mt-4 text-center">
          <p className="text-ds-md font-semibold text-strong">Por enquanto está tudo quieto…</p>
          <p className="mt-1 text-ds-sm text-muted">
            Quando um amigo entrar numa conversa de voz, ele aparece aqui.
          </p>
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-2">
          {inVoice.map((item) => (
            <ActiveVoiceFriendCard
              key={item.friend.id}
              item={item}
              serverName={servers.find((s) => s.id === item.serverId)?.name}
              onJoin={join}
            />
          ))}
        </div>
      )}
    </aside>
  )
}
