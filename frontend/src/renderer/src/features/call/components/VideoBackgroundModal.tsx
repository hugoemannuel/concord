import { useRef, useState } from 'react'
import { useVideoModalStore } from '../store/videoModalStore'
import { useVideoSettingsStore } from '../store/videoSettingsStore'
import { useCallStore } from '../store/callStore'
import { resolveBackgroundEffect, type VideoBackground } from '../lib/videoBackground'
import { trapTab } from '../../../shared/lib/focusTrap'
import { useModalBehavior } from '../../../shared/hooks/useModalBehavior'
import { XIcon } from '../../../shared/ui/icons'
import Button from '../../../shared/ui/Button'
import BackgroundPicker from './BackgroundPicker'
import VideoPreview from './VideoPreview'
import { useBackgroundUpload } from '../hooks/useBackgroundUpload'
import { useVideoPreview } from '../hooks/useVideoPreview'
import IconButton from '../../../shared/ui/IconButton'

/**
 * "Mudar fundo de vídeo" (como no Discord) e a prévia antes de ligar a câmera.
 * Montado na raiz do app: abre do dock da chamada e das Configurações.
 */
export default function VideoBackgroundModal(): React.JSX.Element | null {
  const mode = useVideoModalStore((s) => s.mode)
  return mode ? <Dialog key={mode} mode={mode} /> : null
}

function Dialog({ mode }: { mode: 'background' | 'preview' }): React.JSX.Element {
  const close = useVideoModalStore((s) => s.close)
  const openBackground = useVideoModalStore((s) => s.openBackground)
  const saved = useVideoSettingsStore((s) => s.background)
  const customs = useVideoSettingsStore((s) => s.customs)
  const cameraId = useVideoSettingsStore((s) => s.cameraId)
  const alwaysPreview = useVideoSettingsStore((s) => s.alwaysPreview)
  const setAlwaysPreview = useVideoSettingsStore((s) => s.setAlwaysPreview)
  const setBackground = useVideoSettingsStore((s) => s.setBackground)
  const addCustom = useVideoSettingsStore((s) => s.addCustom)
  const addCustomGif = useVideoSettingsStore((s) => s.addCustomGif)
  const removeCustom = useVideoSettingsStore((s) => s.removeCustom)
  const toggleCamera = useCallStore((s) => s.toggleCamera)

  // Rascunho: só vale ao confirmar ("Alterar plano de fundo").
  const [draft, setDraft] = useState<VideoBackground>(saved)
  const effect = resolveBackgroundEffect(draft, customs)
  const { stream, error, effectFailed } = useVideoPreview(true, cameraId, effect)
  const choose = (id: string): void => setDraft({ mode: 'image', image: { kind: 'custom', id } })
  const { upload, error: uploadError } = useBackgroundUpload(
    (dataUrl) => choose(addCustom(dataUrl, false)),
    async (blob) => choose(await addCustomGif(blob, false))
  )

  const dialogRef = useRef<HTMLDivElement>(null)
  // Foco entra e volta, Esc fecha (o Tab fica preso no onKeyDown do diálogo).
  useModalBehavior(true, close, dialogRef)

  const isBackground = mode === 'background'
  const title = isBackground ? 'Mudar fundo de vídeo' : 'Prévia do vídeo'

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close()
      }}
    >
      <div
        role="dialog"
        ref={dialogRef}
        tabIndex={-1}
        aria-modal="true"
        aria-labelledby="video-modal-title"
        onKeyDown={(e) => trapTab(e, dialogRef.current)}
        className="flex max-h-full w-full max-w-xl flex-col rounded-xl border border-subtle bg-modal shadow-2xl shadow-black/70"
      >
        <div className="flex items-center justify-between px-6 pb-3 pt-5">
          <h2 id="video-modal-title" className="w-full text-center text-ds-lg font-bold text-strong">
            {title}
          </h2>
          <IconButton icon={XIcon} label="Fechar" onClick={close} size="sm" className="-mr-2" />
        </div>

        <div className="space-y-4 overflow-y-auto px-6 pb-4">
          <VideoPreview stream={stream} loading={!error} error={error} />
          {effectFailed && (
            <p className="text-ds-xs text-warning">
              Não foi possível aplicar o fundo neste computador. O vídeo segue normal.
            </p>
          )}
          {isBackground && (
            <div className="space-y-2">
              <p className="text-ds-xs font-bold uppercase tracking-[0.02em] text-muted">
                Fundo do vídeo
              </p>
              <BackgroundPicker
                value={draft}
                customs={customs}
                error={uploadError}
                onChange={setDraft}
                onUpload={upload}
                onRemoveCustom={(id) => {
                  removeCustom(id)
                  if (draft.image?.kind === 'custom' && draft.image.id === id) {
                    setDraft({ mode: 'none', image: null })
                  }
                }}
              />
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-b-xl bg-floating px-6 py-4">
          <label className="flex cursor-pointer items-center gap-2 text-ds-sm text-secondary">
            <input
              type="checkbox"
              checked={alwaysPreview}
              onChange={(e) => setAlwaysPreview(e.target.checked)}
              className="h-4 w-4 cursor-pointer accent-brand"
            />
            Sempre ver prévia do vídeo
          </label>
          {isBackground ? (
            <Button
              variant="primary"
              onClick={() => {
                setBackground(draft)
                close()
              }}
            >
              Alterar plano de fundo
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button variant="ghost" onClick={openBackground}>
                Mudar fundo de vídeo
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  close()
                  void toggleCamera({ skipPreview: true })
                }}
              >
                Ligar câmera
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
