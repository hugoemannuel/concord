import type { ReactNode } from 'react'
import MusicVideo from '../../music/components/MusicVideo'
import type { MusicItem } from '../../music/api/music'
import { useMusicStore } from '../../music/store/musicStore'
import CloseButton from '../../../shared/ui/CloseButton'

/** Vídeo da música em destaque (como uma tela em foco) + faixa com as pessoas. */
function MusicStage({
  serverId,
  item,
  startedAt,
  strip
}: {
  serverId: string
  item: MusicItem
  startedAt: number
  strip: ReactNode
}): React.JSX.Element {
  const setStageVideo = useMusicStore((s) => s.setStageVideo)

  return (
    <div className="flex h-full w-full flex-col gap-4">
      <div
        data-music-video-stage
        className="relative flex min-h-0 flex-1 items-center justify-center bg-black"
      >
        <MusicVideo serverId={serverId} item={item} startedAt={startedAt} variant="stage" />
        <CloseButton variant="media" size="xs" onClick={() => setStageVideo(false)} className="absolute right-2 top-2" />
      </div>
      {strip}
    </div>
  )
}

export default MusicStage
