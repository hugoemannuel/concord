import { errorMessage } from '../../../shared/lib/errorMessage'
import { useCallStore } from '../store/callStore'
import { useMusicStore } from '../../music/store/musicStore'
import { MAESTRO_NAME, maestroIdentity } from '../../music/lib/music'
import { useServerStore } from '../../servers/store/serverStore'
import { useServerNicknames } from '../../servers/hooks/useServerNames'
import { serverDisplayName } from '../../servers/lib/serverNames'
import { showToast } from '../../../shared/store/toastStore'
import Button from '../../../shared/ui/Button'
import { VolumeIcon } from '../../../shared/ui/icons'
import ParticipantTile from './ParticipantTile'

/** Botão "Entrar na voz" do canal (avisa se não conseguir). */
function JoinVoiceButton({ channelId }: { channelId: string }): React.JSX.Element {
  const joinVoiceChannel = useCallStore((s) => s.joinVoiceChannel)
  const handleJoin = (): void => {
    joinVoiceChannel(channelId).catch((err) => {
      showToast.error(errorMessage(err, 'Falha ao entrar no canal de voz.'))
    })
  }
  return (
    <Button variant="success" onClick={handleJoin} className="px-6 py-2.5 font-semibold">
      Entrar na voz
    </Button>
  )
}

/** Canal de voz visto de fora (não conectado): quem está nele e o botão de entrar. */
function VoiceLobby({
  channelId,
  serverId
}: {
  channelId: string
  serverId?: string
}): React.JSX.Element {
  const entry = useCallStore((s) => s.serverCalls[channelId])
  // O canal é do servidor aberto: nomes com o apelido de lá.
  const nicknames = useServerNicknames(useServerStore((s) => s.currentServer?.id))
  const maestroHere = useMusicStore((s) =>
    Boolean(serverId && s.presence[serverId]?.includes(channelId))
  )
  const participants = entry?.participants ?? []
  const sharing = entry?.screen_sharing ?? []

  if (participants.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full border border-success/40 bg-success/10 text-success shadow-lg">
          <VolumeIcon className="h-9 w-9" />
        </div>
        <div>
          <h2 className="text-ds-lg font-bold text-strong">Ninguém aqui ainda</h2>
          <p className="mt-1 text-ds-sm text-muted">
            Entre na voz para conversar com os membros do servidor.
          </p>
        </div>
        <JoinVoiceButton channelId={channelId} />
      </div>
    )
  }
  return (
    <div className="flex flex-wrap items-center justify-center gap-4">
      {participants.map((p) => (
        <ParticipantTile
          key={p.user_id}
          user={{
            id: p.user_id,
            username: p.username ?? '',
            display_name: serverDisplayName({ nickname: nicknames?.[p.user_id] }, p),
            avatar_url: p.avatar_url ?? null,
            name_style: nicknames?.[p.user_id] ? null : p.name_style
          }}
          isScreen={sharing.includes(p.user_id)}
        />
      ))}
      {maestroHere && (
        <ParticipantTile
          user={{
            id: maestroIdentity(channelId),
            username: '',
            display_name: MAESTRO_NAME,
            avatar_url: null
          }}
        />
      )}
      <JoinVoiceButton channelId={channelId} />
    </div>
  )
}

export default VoiceLobby
