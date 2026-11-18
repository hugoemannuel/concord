import { useCallChannelName } from '../../call/hooks/useCallChannelName'
import { useUserLook } from '../../profile/store/profileStore'
import Avatar from '../../../shared/ui/Avatar'
import { VolumeIcon } from '../../../shared/ui/icons'
import StyledName from '../../profile/components/StyledName'
import { VoiceAvatarStack } from '../../servers/components/VoiceAvatarStack'
import type { FriendInVoice } from '../lib/onlineFriends'
import { inCallCount, joinFriendCallLabel, voiceCardLine } from '../lib/activeVoiceCopy'

/** Card de "Ativo agora": amigo, servidor · canal e quem está na call. O clique entra. */
export default function ActiveVoiceFriendCard({
  item,
  serverName,
  onJoin
}: {
  item: FriendInVoice
  serverName: string | undefined
  onJoin: (target: { serverId: string; channelId: string }) => void
}): React.JSX.Element {
  const { friend, serverId, channelId, people } = item
  const look = useUserLook(friend.id, {
    name: friend.display_name || friend.username,
    avatarUrl: friend.avatar_url,
    decorationUrl: friend.avatar_decoration_url
  })
  const channelName = useCallChannelName(serverId, channelId)
  return (
    <button
      type="button"
      onClick={() => onJoin({ serverId, channelId })}
      aria-label={joinFriendCallLabel(look.name, channelName)}
      className="focus-ring flex w-full cursor-pointer flex-col gap-2 rounded-lg border border-subtle bg-floating p-3 text-left transition-colors hover:bg-fg/5"
    >
      <span aria-hidden="true" className="flex w-full min-w-0 items-center gap-3">
        <Avatar
          userId={friend.id}
          name={look.name}
          avatarUrl={look.avatarUrl}
          decorationUrl={look.decorationUrl}
          size={32}
        />
        <span className="block min-w-0">
          <span className="block truncate text-ds-md font-medium text-strong">
            <StyledName name={look.name} userId={friend.id} style={friend.name_style} />
          </span>
          <span className="flex min-w-0 items-center gap-1 text-ds-xs text-muted">
            <VolumeIcon className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{voiceCardLine(serverName, channelName)}</span>
          </span>
        </span>
      </span>
      <span aria-hidden="true" className="flex items-center gap-2">
        <VoiceAvatarStack people={people} ringClass="ring-[var(--bg-floating)]" />
        <span className="text-ds-xs text-muted">{inCallCount(people.length)}</span>
      </span>
    </button>
  )
}
