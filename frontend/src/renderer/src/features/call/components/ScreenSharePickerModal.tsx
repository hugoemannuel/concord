import { useCallback, useEffect, useRef, useState } from 'react'
import { notePickedSource } from '../lib/windowAudio'
import type { ScreenSourceInfo } from '../../../../../preload/index.d'
import Button from '../../../shared/ui/Button'
import { notePickerCancelled } from '../lib/screenPickerCancel'
import { pickerChoice } from '../lib/screenPickerChoice'
import { loadScreenQuality, saveScreenQuality } from '../lib/screenShareQuality'
import ScreenQualityControls from './ScreenQualityControls'
import { trapTab } from '../../../shared/lib/focusTrap'
import { ScreenPickerTabs, ScreenSourceGrid, type ScreenPickerTab } from './ScreenSourceGrid'

/**
 * Picker de fonte para compartilhamento de tela (estilo Discord).
 * Aberto quando o main process sinaliza um getDisplayMedia pendente
 * (`screen-picker:show`); a seleção volta via IPC.
 */
function ScreenSharePickerModal(): React.JSX.Element | null {
  // No navegador (fora do Electron) não há preload/IPC: o picker nativo
  // do Chromium cuida do getDisplayMedia e este modal fica inerte.
  const screenPicker = typeof window !== 'undefined' ? window.api?.screenPicker : undefined

  const [open, setOpen] = useState(false)
  const [quality, setQuality] = useState(loadScreenQuality)
  const dialogRef = useRef<HTMLDivElement>(null)
  const [sources, setSources] = useState<ScreenSourceInfo[]>([])
  // Listar as fontes demora (miniaturas): antes disso não dá para dizer "nenhuma opção".
  const [sourcesLoaded, setSourcesLoaded] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [tab, setTab] = useState<ScreenPickerTab>('screen')

  useEffect(() => {
    if (!screenPicker) return
    const off = screenPicker.onShow(() => {
      setSelected(null)
      // Sem a lista da última vez: clicar nela valeria só até a nova chegar.
      setSources([])
      setSourcesLoaded(false)
      setQuality(loadScreenQuality())
      setTab('screen')
      setOpen(true)
    })
    return off
  }, [screenPicker])

  useEffect(() => {
    if (!open || !screenPicker) return
    let cancelled = false
    screenPicker
      .listSources()
      .then((all) => {
        if (cancelled) return
        setSources(all)
        setSourcesLoaded(true)
      })
      .catch(() => setOpen(false))
    return () => {
      cancelled = true
    }
  }, [open, screenPicker])

  const screens = sources.filter((s) => s.displayId !== '')
  const windows = sources.filter((s) => s.displayId === '')
  const visible = tab === 'screen' ? screens : windows
  const chosen = pickerChoice(visible, selected)

  const close = useCallback((): void => {
    setOpen(false)
  }, [])

  const cancel = useCallback((): void => {
    notePickerCancelled()
    screenPicker?.cancel()
    close()
  }, [screenPicker, close])

  const confirm = useCallback((): void => {
    if (!chosen) return
    saveScreenQuality(quality)
    notePickedSource(chosen)
    screenPicker?.select(chosen)
    close()
  }, [screenPicker, chosen, close, quality])

  useEffect(() => {
    if (!open) return
    const previousFocus = document.activeElement as HTMLElement | null
    dialogRef.current?.focus()
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') cancel()
      trapTab(e, dialogRef.current)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      previousFocus?.focus()
    }
  }, [open, cancel])

  if (!open) return null

  const selectTab = (next: ScreenPickerTab): void => {
    setTab(next)
    setSelected(null)
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div
        role="dialog"
        ref={dialogRef}
        tabIndex={-1}
        aria-modal="true"
        aria-label="Compartilhe sua tela"
        className="rounded-xl border border-subtle bg-modal shadow-2xl shadow-black/70 max-h-[95vh] w-full max-w-2xl overflow-y-auto p-6"
      >
        <h2 className="text-ds-lg font-bold text-strong">Compartilhe sua tela</h2>
        <ScreenPickerTabs tab={tab} onChange={selectTab} />
        <ScreenSourceGrid
          loaded={sourcesLoaded}
          sources={visible}
          selected={chosen}
          onSelect={setSelected}
        />

        <ScreenQualityControls value={quality} onChange={setQuality} />

        <div className="mt-5 flex justify-end gap-3">
          <Button variant="ghost" onClick={cancel}>
            Cancelar
          </Button>
          <Button variant="primary" disabled={!chosen} onClick={confirm}>
            Compartilhar
          </Button>
        </div>
      </div>
    </div>
  )
}

export default ScreenSharePickerModal
