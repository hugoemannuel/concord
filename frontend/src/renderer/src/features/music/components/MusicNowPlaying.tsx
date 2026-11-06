import { skipMusic, type MusicItem, type MusicState } from '../api/music'
import { formatDuration, T20 } from '../lib/music'
import { progressPercent, skipView } from '../lib/musicPanel'
import { useMusicStore } from '../store/musicStore'
import { errorMessage } from '../../../shared/lib/errorMessage'
import { showToast } from '../../../shared/store/toastStore'
import { useElapsed } from '../../call/lib/callUtils'
import MusicVideo from './MusicVideo'

interface MusicNowPlayingProps {
  serverId: string
  now: { item: MusicItem; started_at: number }
  skip: MusicState['skip']
  panelOpen: boolean
  meId: string | undefined
}

/** Leva o vídeo para o palco (se ainda não está) e pede tela cheia. */
function useGoFullscreen(): () => void {
  const stageVideo = useMusicStore((s) => s.stageVideo)
  const setStageVideo = useMusicStore((s) => s.setStageVideo)
  return () => {
    const request = (): void => {
      void document
        .querySelector<HTMLElement>('[data-music-video-stage]')
        ?.requestFullscreen?.()
        .catch(() => {})
    }
    if (stageVideo) return request()
    setStageVideo(true)
    requestAnimationFrame(request)
  }
}

function VideoButtons(): React.JSX.Element {
  const setStageVideo = useMusicStore((s) => s.setStageVideo)
  const goFullscreen = useGoFullscreen()
  return (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={() => setStageVideo(true)}
        className="cursor-pointer rounded bg-fg/10 px-2 py-1 text-xs text-strong hover:bg-fg/15"
      >
        {T20.watch}
      </button>
      <button
        type="button"
        onClick={goFullscreen}
        className="cursor-pointer rounded bg-fg/10 px-2 py-1 text-xs text-strong hover:bg-fg/15"
      >
        {T20.fullscreen}
      </button>
    </div>
  )
}

/** "Tocando agora": vídeo, título, progresso e o botão de pular/votar. */
function MusicNowPlaying({
  serverId,
  now,
  skip,
  panelOpen,
  meId
}: MusicNowPlayingProps): React.JSX.Element {
  const serverOffsetMs = useMusicStore((s) => s.serverOffsetMs)
  // useElapsed recebe o início em ms (relógio local) e devolve segundos.
  const elapsed = useElapsed(now.started_at - serverOffsetMs)
  const skipButton = skipView(now.item, skip, meId)

  const onSkip = (): void => {
    skipMusic(serverId).catch((err) => showToast.error(errorMessage(err, 'Falha na operação.')))
  }

  return (
    <div className="flex flex-col gap-2">
      {panelOpen && <MusicVideo serverId={serverId} item={now.item} startedAt={now.started_at} />}
      {now.item.has_video && <VideoButtons />}
      <div className="min-w-0">
        <p data-testid="music-now-title" className="truncate font-semibold text-strong">
          {now.item.title}
        </p>
        <p className="truncate text-xs text-gray-400">
          {now.item.artist} · @{now.item.requested_by.username}
        </p>
      </div>
      <div className="h-1 overflow-hidden rounded bg-fg/10">
        <div
          className="h-full bg-violet-400"
          style={{ width: `${progressPercent(elapsed, now.item.duration_ms)}%` }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-gray-500">
        <span>{formatDuration(elapsed * 1000)}</span>
        <span>{formatDuration(now.item.duration_ms)}</span>
      </div>
      <button
        type="button"
        onClick={onSkip}
        disabled={skipButton.disabled}
        className="cursor-pointer rounded-md bg-fg/10 px-3 py-1.5 text-sm font-semibold text-strong hover:bg-fg/15 disabled:opacity-50"
      >
        {skipButton.label}
      </button>
    </div>
  )
}

export default MusicNowPlaying
