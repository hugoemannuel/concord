import { useEffect, useRef, useState } from 'react'
import { useScreenQualityStore } from '../store/screenQualityStore'
import { loadScreenQuality, saveScreenQuality } from '../lib/screenShareQuality'
import ScreenQualityControls from './ScreenQualityControls'
import NativeLiveToggle from './NativeLiveToggle'
import Button from '../../../shared/ui/Button'
import { trapTab } from '../../../shared/lib/focusTrap'
import { useModalBehavior } from '../../../shared/hooks/useModalBehavior'

export default function ScreenQualityModal(): React.JSX.Element | null {
  const request = useScreenQualityStore((s) => s.request)
  return request ? <QualityDialog key="quality" request={request} /> : null
}

function QualityDialog({
  request
}: {
  request: { resolve: (quality: ReturnType<typeof loadScreenQuality> | null) => void }
}): React.JSX.Element {
  const portal = window.api?.screenShare?.flow === 'portal'
  const [quality, setQuality] = useState(loadScreenQuality)
  const mounted = useRef(false)
  const dialogRef = useRef<HTMLDivElement>(null)
  // Foco entra e volta, Esc cancela (o Tab fica preso no onKeyDown do diálogo).
  useModalBehavior(true, () => request.resolve(null), dialogRef)
  // Desmontou sem escolher (ex.: a chamada caiu): cancela o pedido.
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      queueMicrotask(() => {
        if (!mounted.current) request.resolve(null)
      })
    }
  }, [request])
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        ref={dialogRef}
        tabIndex={-1}
        aria-modal="true"
        aria-labelledby="screen-quality-title"
        onKeyDown={(e) => trapTab(e, dialogRef.current)}
        className="rounded-xl border border-subtle bg-modal shadow-2xl shadow-black/70 w-full max-w-xl p-6"
      >
        <h2 id="screen-quality-title" className="text-ds-lg font-bold text-strong">
          Compartilhe sua tela
        </h2>
        <ScreenQualityControls value={quality} onChange={setQuality} />
        {portal && <NativeLiveToggle />}
        {portal && (
          <p className="mt-3 text-ds-xs text-muted">
            A tela é escolhida no seletor do sistema. No Linux, o som não vai junto — só o vídeo.
          </p>
        )}
        <div className="mt-5 flex justify-end gap-3">
          <Button variant="ghost" onClick={() => request.resolve(null)}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              saveScreenQuality(quality)
              request.resolve(quality)
            }}
          >
            Escolher tela
          </Button>
        </div>
      </div>
    </div>
  )
}
