import { useMemo } from 'react'
import type { PublicUser } from '../../auth/store/authStore'
import { useCallStore } from '../../call/store/callStore'
import { useUserLook } from '../../profile/store/profileStore'
import Avatar from '../../../shared/ui/Avatar'
import StyledName from '../../profile/components/StyledName'
import { FriendsActivity } from '../../activity/components/FriendsActivity'
import { friendsInVoice } from '../lib/onlineFriends'

function ActiveVoiceFriendCard({ friend }: { friend: PublicUser }): React.JSX.Element {
  const look = useUserLook(friend.id, {
    name: friend.display_name || friend.username,
    avatarUrl: friend.avatar_url,
    decorationUrl: friend.avatar_decoration_url
  })
  return (
    <div className="flex items-center gap-3 rounded-lg bg-floating p-3">
      <Avatar userId={friend.id} name={look.name} avatarUrl={look.avatarUrl} decorationUrl={look.decorationUrl} size={32} />
      <div className="min-w-0">
        <p className="truncate text-ds-md font-medium text-strong">
          <StyledName name={look.name} userId={friend.id} style={friend.name_style} />
        </p>
        <p className="truncate text-ds-xs text-muted">Em um canal de voz</p>
      </div>
    </div>
  )
}

/** Coluna "Ativo agora": amigos em canais de voz que o app conhece. */
export default function ActiveNow({ friends }: { friends: PublicUser[] }): React.JSX.Element {
  const serverCalls = useCallStore((s) => s.serverCalls)
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
          {inVoice.map((f) => (
            <ActiveVoiceFriendCard key={f.id} friend={f} />
          ))}
        </div>
      )}
    </aside>
  )
}
