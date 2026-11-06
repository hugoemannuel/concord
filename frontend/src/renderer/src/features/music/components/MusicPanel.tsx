import { useRef } from 'react'
import { T17, T20 } from '../lib/music'
import { useAuthStore } from '../../auth/store/authStore'
import { useMusicStore } from '../store/musicStore'
import { useMusicPanelDismiss } from '../hooks/useMusicPanelDismiss'
import Switch from '../../../shared/ui/Switch'
import { XIcon } from '../../../shared/ui/icons'
import MusicNowPlaying from './MusicNowPlaying'
import MusicQueue from './MusicQueue'

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
  const meId = useAuthStore((s) => s.user?.id)
  const asideRef = useRef<HTMLElement | null>(null)
  useMusicPanelDismiss(panelOpen, closePanel, asideRef)

  if (!state) return null

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
      {state.now && (
        <MusicNowPlaying serverId={serverId} now={state.now} skip={state.skip} panelOpen={panelOpen} meId={meId} />
      )}

      <MusicQueue serverId={serverId} queue={state.queue} meId={meId} />

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
