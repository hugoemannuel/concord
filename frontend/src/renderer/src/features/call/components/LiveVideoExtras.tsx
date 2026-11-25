import { useAuthStore } from '../../auth/store/authStore'
import { useCallStore } from '../store/callStore'
import { liveOwner } from '../lib/liveVideo'
import { useLiveInView } from '../hooks/useLiveInView'
import { useLiveFirstFrame } from '../hooks/useLiveFirstFrame'
import ScreenStatsCorner from './ScreenStatsPanel'
import LivePipButton from './LivePipButton'

/**
 * O que todo <video> de live ganha: o ícone de estatísticas no canto e, na live
 * de outra pessoa, o botão da janela flutuante e o aviso de fora de vista (pausa
 * o vídeo, o som segue). Câmera não.
 */
export default function LiveVideoExtras({
  stream,
  videoRef
}: {
  stream: MediaStream
  videoRef: React.RefObject<HTMLVideoElement | null>
}): React.JSX.Element | null {
  const meId = useAuthStore((s) => s.user?.id ?? 'me')
  const localScreen = useCallStore((s) => s.localScreenStream)
  const screenStreams = useCallStore((s) => s.screenStreams)
  const owner = liveOwner(stream, localScreen, screenStreams, meId)
  const remote = owner && !owner.local ? owner.userId : null
  useLiveInView(remote, videoRef)
  useLiveFirstFrame(remote, videoRef, stream)
  if (!owner) return null
  return (
    <>
      <ScreenStatsCorner owner={owner} />
      {!owner.local && <LivePipButton userId={owner.userId} />}
    </>
  )
}
