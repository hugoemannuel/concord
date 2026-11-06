import { useCallback, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useCallStore } from '../store/callStore'
import { useSettingsStore } from '../../settings/store/settingsStore'
import { useVideoSettingsStore } from '../store/videoSettingsStore'
import { useVideoModalStore } from '../store/videoModalStore'
import { deviceOptions } from '../lib/audioDevices'
import { nextMenuIndex } from '../../../shared/lib/menuNav'
import { CAN_CHOOSE_OUTPUT, useAudioDevices } from '../hooks/useAudioDevices'
import { CheckIcon } from '../../../shared/ui/icons'
import DeviceVolume from './DeviceVolume'
import { useDismiss } from '../../../shared/hooks/useDismiss'
import { insideAny } from '../../../shared/lib/dismiss'

const MENU_WIDTH = 260
const GAP = 8
const MARGIN = 8
const ITEM_SELECTOR = '[role="menuitemradio"], [role="menuitem"]'

const TITLES: Record<AudioDeviceKind, string> = {
  input: 'Dispositivo de entrada',
  output: 'Dispositivo de saída',
  camera: 'Câmera'
}
const DEVICE_KINDS: Record<AudioDeviceKind, MediaDeviceKind> = {
  input: 'audioinput',
  output: 'audiooutput',
  camera: 'videoinput'
}

const ACTION_CLASS =
  'flex w-full cursor-pointer items-center rounded px-2 py-1.5 text-left text-ds-sm font-medium text-gray-300 outline-none transition-colors hover:bg-brand hover:text-white focus-visible:bg-brand focus-visible:text-white'

export type AudioDeviceKind = 'input' | 'output' | 'camera'

/**
 * Menu da setinha (ou do clique direito) no microfone/fone/câmera (como no Discord):
 * escolhe o dispositivo, ajusta o volume de entrada/saída ou troca a câmera sem
 * abrir as Configurações. Usa
 * as mesmas ações do store que Configurações → Voz e Vídeo; o da câmera também
 * abre o "Mudar fundo de vídeo".
 *
 * Teclado: abre com o foco no dispositivo marcado; setas, Home e End andam
 * entre os itens; Esc ou Tab fecham e devolvem o foco à setinha.
 */
function AudioDeviceMenu({
  kind,
  anchor,
  onClose
}: {
  kind: AudioDeviceKind
  anchor: HTMLElement
  onClose: () => void
}): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  /** A pessoa já andou pelo menu: a lista chegando não puxa mais o foco. */
  const moved = useRef(false)
  // Sem o "pedido de permissão" das Configurações: um clique não abre o prompt.
  const devices = useAudioDevices({ probe: false })
  const inputId = useCallStore((s) => s.inputDeviceId)
  const outputId = useCallStore((s) => s.outputDeviceId)
  const cameraId = useVideoSettingsStore((s) => s.cameraId)
  const selected = kind === 'input' ? inputId : kind === 'output' ? outputId : cameraId
  const setInputDevice = useCallStore((s) => s.setInputDevice)
  const setOutputDevice = useCallStore((s) => s.setOutputDevice)
  const setCameraDevice = useCallStore((s) => s.setCameraDevice)
  const openSettings = useSettingsStore((s) => s.openSettings)
  const openBackground = useVideoModalStore((s) => s.openBackground)

  const title = TITLES[kind]
  const canChoose = kind !== 'output' || CAN_CHOOSE_OUTPUT
  const options = deviceOptions(devices, DEVICE_KINDS[kind])
  // Dispositivo escolhido foi desconectado: o áudio está no padrão, marca ele.
  const checkedId = options.some((o) => o.id === selected) ? selected : ''

  // Acima da setinha, sem sair da janela (a sidebar fica colada na esquerda).
  const rect = anchor.getBoundingClientRect()
  const left = Math.min(
    Math.max(MARGIN, rect.right - MENU_WIDTH),
    window.innerWidth - MENU_WIDTH - MARGIN
  )
  const bottom = window.innerHeight - rect.top + GAP

  /** Fecha devolvendo o foco à setinha (teclado). */
  const closeToAnchor = useCallback(() => {
    onClose()
    anchor.focus()
  }, [anchor, onClose])

  useDismiss(
    (target) => insideAny([ref.current, anchor], target),
    (reason) => (reason === 'escape' ? closeToAnchor() : onClose())
  )

  // Foco no item marcado ao abrir e de novo quando a lista de dispositivos
  // chega (antes dela só existe "Padrão do sistema").
  const optionCount = options.length
  useEffect(() => {
    const menu = ref.current
    if (!menu || moved.current) return
    const target =
      menu.querySelector<HTMLElement>('[aria-checked="true"]') ??
      menu.querySelector<HTMLElement>(ITEM_SELECTOR)
    target?.focus()
  }, [optionCount])

  const onMenuKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'Tab') {
      e.preventDefault()
      closeToAnchor()
      return
    }
    const items = [...(ref.current?.querySelectorAll<HTMLElement>(ITEM_SELECTOR) ?? [])]
    const current = items.indexOf(document.activeElement as HTMLElement)
    const next = nextMenuIndex(current, items.length, e.key)
    if (next === null) return
    e.preventDefault()
    moved.current = true
    items[next].focus()
  }

  const choose = (id: string): void => {
    if (kind === 'input') void setInputDevice(id)
    else if (kind === 'output') setOutputDevice(id)
    else void setCameraDevice(id)
    closeToAnchor()
  }

  return createPortal(
    <div
      ref={ref}
      role="menu"
      aria-label={title}
      onKeyDown={onMenuKeyDown}
      style={{ width: MENU_WIDTH, left, bottom }}
      className="fixed z-50 rounded-lg border border-subtle bg-floating p-1.5 shadow-2xl"
    >
      <p className="px-2 pb-1 pt-0.5 text-ds-xs font-bold uppercase tracking-[0.02em] text-gray-400">
        {title}
      </p>
      {canChoose ? (
        <div className="max-h-64 overflow-y-auto">
          {options.map((o) => {
            const checked = o.id === checkedId
            return (
              <button
                key={o.id || 'default'}
                type="button"
                role="menuitemradio"
                aria-checked={checked}
                tabIndex={-1}
                onClick={() => choose(o.id)}
                title={o.label}
                className={`flex w-full cursor-pointer items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-ds-sm font-medium outline-none transition-colors hover:bg-brand hover:text-white focus-visible:bg-brand focus-visible:text-white ${
                  checked ? 'text-strong' : 'text-gray-300'
                }`}
              >
                <span className="min-w-0 truncate">{o.label}</span>
                {checked && <CheckIcon className="h-4 w-4 shrink-0" />}
              </button>
            )
          })}
        </div>
      ) : (
        <p className="px-2 py-1.5 text-ds-xs text-gray-400">
          Este navegador não deixa escolher a saída de áudio.
        </p>
      )}
      <div className="my-1 border-t border-subtle" />
      {kind !== 'camera' && (
        <>
          <DeviceVolume kind={kind} />
          <div className="my-1 border-t border-subtle" />
        </>
      )}
      {kind === 'camera' && (
        <button
          type="button"
          role="menuitem"
          tabIndex={-1}
          onClick={() => {
            onClose()
            openBackground()
          }}
          className={ACTION_CLASS}
        >
          Mudar fundo de vídeo
        </button>
      )}
      <button
        type="button"
        role="menuitem"
        tabIndex={-1}
        onClick={() => {
          onClose()
          openSettings(kind === 'camera' ? 'video' : 'voice')
        }}
        className={ACTION_CLASS}
      >
        {kind === 'camera' ? 'Configurações de vídeo' : 'Configurações de voz'}
      </button>
    </div>,
    document.body
  )
}

export default AudioDeviceMenu
