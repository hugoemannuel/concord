import { errorMessage } from '../../../shared/lib/errorMessage'
import { useEffect, useRef, useState } from 'react'
import { removeQueueItem, skipMusic, swapQueueItems, type MusicItem } from '../api/music'
import { canSwap, formatDuration, QUEUE_PREVIEW, T17, T20 } from '../lib/music'
import { useAuthStore } from '../../auth/store/authStore'
import { useMusicStore } from '../store/musicStore'
import { showToast } from '../../../shared/store/toastStore'
import Switch from '../../../shared/ui/Switch'
import { XIcon } from '../../../shared/ui/icons'
import { useElapsed } from '../../call/lib/callUtils'
import MusicVideo from './MusicVideo'

function errorText(err: unknown): string {
  return errorMessage(err, 'Falha na operação.')
}

/** Painel "Tocando agora" da call: coluna que desliza da esquerda sobre a tela
 *  de voz ao clicar no Maestro (clicar de novo, fora, Esc ou no X fecha).
 *  Fechar só esconde o painel (a música e o vídeo do palco seguem). */
function MusicPanel({ serverId }: { serverId: string }): React.JSX.Element | null {
  const state = useMusicStore((s) => s.state)
  const panelOpen = useMusicStore((s) => s.panelOpen)
  const closePanel = useMusicStore((s) => s.closePanel)
  const ducking = useMusicStore((s) => s.duckingEnabled)
  const setDucking = useMusicStore((s) => s.setDucking)
  const videoEnabled = useMusicStore((s) => s.videoEnabled)
  const setVideoEnabled = useMusicStore((s) => s.setVideoEnabled)
  const stageVideo = useMusicStore((s) => s.stageVideo)
  const setStageVideo = useMusicStore((s) => s.setStageVideo)
  const serverOffsetMs = useMusicStore((s) => s.serverOffsetMs)
  const meId = useAuthStore((s) => s.user?.id)
  const [dragId, setDragId] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)
  // useElapsed recebe o início em ms (relógio local) e devolve segundos.
  const startedAt = state?.now ? state.now.started_at - serverOffsetMs : null
  const elapsed = useElapsed(startedAt)
  const asideRef = useRef<HTMLElement | null>(null)

  // Clique fora fecha. O Maestro (tile ou linha da lateral) fica de fora: ele
  // mesmo alterna, senão o clique fecharia e reabriria na sequência.
  useEffect(() => {
    if (!panelOpen) return
    const onDown = (e: MouseEvent): void => {
      const target = e.target as Element | null
      if (!target || asideRef.current?.contains(target) || target.closest('[data-maestro-tile]'))
        return
      closePanel()
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') closePanel()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [panelOpen, closePanel])

  if (!state) return null
  const now = state.now
  const mineNow = now?.item.requested_by.id === meId
  const voted = !!meId && state.skip.voters.includes(meId)

  const onSkip = (): void => {
    skipMusic(serverId).catch((err) => showToast.error(errorText(err)))
  }
  const onDrop = (target: MusicItem): void => {
    const source = state.queue.find((i) => i.id === dragId)
    setDragId(null)
    if (!source || !canSwap(source, target, meId)) return
    swapQueueItems(serverId, source.id, target.id).catch((err) => showToast.error(errorText(err)))
  }

  const goFullscreen = (): void => {
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

  return (
    <aside
      ref={asideRef}
      aria-hidden={!panelOpen}
      className={`absolute inset-y-0 left-0 z-20 flex w-72 flex-col gap-3 overflow-y-auto border-r border-subtle bg-floating p-4 shadow-2xl backdrop-blur transition-all duration-300 ease-out ${
        panelOpen
          ? 'translate-x-0 opacity-100'
          : 'pointer-events-none invisible -translate-x-full opacity-0'
      }`}
    >
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-wide text-gray-400">{T17.title}</h3>
        <button
          type="button"
          onClick={closePanel}
          aria-label="Fechar"
          title="Fechar"
          className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-fg/10 text-gray-200 transition-colors hover:bg-fg/20 hover:text-strong"
        >
          <XIcon className="h-4 w-4" />
        </button>
      </div>
      {now && (
        <div className="flex flex-col gap-2">
          {panelOpen && (
            <MusicVideo serverId={serverId} item={now.item} startedAt={now.started_at} />
          )}
          {now.item.has_video && (
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
          )}
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
              style={{
                width: `${Math.min(100, ((elapsed * 1000) / Math.max(1, now.item.duration_ms)) * 100)}%`
              }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-gray-500">
            <span>{formatDuration(elapsed * 1000)}</span>
            <span>{formatDuration(now.item.duration_ms)}</span>
          </div>
          <button
            type="button"
            onClick={onSkip}
            disabled={!mineNow && voted}
            className="cursor-pointer rounded-md bg-fg/10 px-3 py-1.5 text-sm font-semibold text-strong hover:bg-fg/15 disabled:opacity-50"
          >
            {mineNow ? T17.skip : T17.vote(state.skip.votes, state.skip.needed)}
          </button>
        </div>
      )}

      <h3 className="mt-2 text-xs font-bold uppercase tracking-wide text-gray-400">{T17.next}</h3>
      {state.queue.length === 0 ? (
        <p className="text-sm text-gray-500">{T17.empty}</p>
      ) : (
        <ol className="flex flex-col gap-1">
          {(showAll ? state.queue : state.queue.slice(0, QUEUE_PREVIEW)).map((it, i) => {
            const mine = it.requested_by.id === meId
            return (
              <li
                key={it.id}
                draggable={mine}
                onDragStart={() => setDragId(it.id)}
                onDragOver={(e) => {
                  const source = state.queue.find((q) => q.id === dragId)
                  if (source && canSwap(source, it, meId)) e.preventDefault()
                }}
                onDrop={() => onDrop(it)}
                className={`flex items-center gap-2 rounded px-2 py-1 text-sm ${mine ? 'cursor-grab bg-fg/5' : 'opacity-80'}`}
              >
                <span className="w-4 text-xs text-gray-500">{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-strong">{it.title}</span>
                  <span className="block truncate text-[11px] text-gray-500">
                    {formatDuration(it.duration_ms)} · @{it.requested_by.username}
                  </span>
                </span>
                {mine && (
                  <button
                    type="button"
                    aria-label="Remover"
                    onClick={() =>
                      removeQueueItem(serverId, it.id).catch((err) =>
                        showToast.error(errorText(err))
                      )
                    }
                    className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-gray-300 transition-colors hover:bg-fg/15 hover:text-strong"
                  >
                    <XIcon className="h-3.5 w-3.5" />
                  </button>
                )}
              </li>
            )
          })}
        </ol>
      )}
      {state.queue.length > QUEUE_PREVIEW && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          aria-expanded={showAll}
          className="cursor-pointer rounded-md bg-fg/10 px-3 py-1.5 text-xs font-semibold text-gray-200 transition-colors hover:bg-fg/15 hover:text-strong"
        >
          {showAll ? T20.seeLess : T20.seeMore(state.queue.length - QUEUE_PREVIEW)}
        </button>
      )}

      <div className="mt-auto flex items-center justify-between gap-2 text-xs text-gray-300">
        <span>{T20.showInPanel}</span>
        <Switch checked={videoEnabled} onChange={setVideoEnabled} label={T20.showInPanel} />
      </div>
      <div className="flex items-center justify-between gap-2 text-xs text-gray-300">
        <span>{T17.ducking}</span>
        <Switch checked={ducking} onChange={setDucking} label={T17.ducking} />
      </div>
    </aside>
  )
}

export default MusicPanel
