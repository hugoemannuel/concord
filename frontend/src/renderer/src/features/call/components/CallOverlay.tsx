import { useCallStore } from '../store/callStore'
import { useMusicDucking } from '../../music/hooks/useMusicDucking'
import { useForgetEndedLives } from '../hooks/useForgetEndedLives'
import RemoteAudio from './RemoteAudio'
import { remoteAudioEntries } from '../lib/remoteAudioEntries'

/**
 * Host global dos <audio> remotos. A UI das chamadas vive nas views
 * (VoiceChannelView para canais, DmCallView para DMs) — aqui só mantemos
 * os elementos de áudio montados para o som não cortar ao navegar.
 */
function CallOverlay(): React.JSX.Element | null {
  const status = useCallStore((s) => s.status)
  const streams = useCallStore((s) => s.streams)
  const screenAudioStreams = useCallStore((s) => s.screenAudioStreams)
  const deafened = useCallStore((s) => s.deafened)
  // Vozes seguem o ensurdecer; o som das telas (jogo, vídeo…) não.
  const entries = remoteAudioEntries({ streams, screenAudioStreams, deafened })
  const musicGain = useMusicDucking(entries.some((e) => e.music))
  useForgetEndedLives()

  if (status === 'idle') return null

  return (
    <>
      {entries.map((e) => (
        <RemoteAudio
          key={e.key}
          stream={e.stream}
          muted={e.muted}
          userId={e.volumeKey}
          gain={e.music ? musicGain : 1}
        />
      ))}
    </>
  )
}

export default CallOverlay
