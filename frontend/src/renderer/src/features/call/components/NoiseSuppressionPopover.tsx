import { useRef } from 'react'
import { createPortal } from 'react-dom'
import { useNoiseSuppressionStore } from '../store/noiseSuppressionStore'
import { useRnnoiseStatusStore } from '../store/rnnoiseStatusStore'
import MicTest from './MicTest'
import Switch from '../../../shared/ui/Switch'
import { useDismiss } from '../../../shared/hooks/useDismiss'
import { insideAny } from '../../../shared/lib/dismiss'

const RNNOISE_URL = 'https://jmvalin.ca/demo/rnnoise/'
const POPOVER_WIDTH = 320
const GAP = 8
const MARGIN = 8

/** Conteúdo do popover (também usado em Configurações → Voz). */
export function NoiseSuppressionSettings(): React.JSX.Element {
  const enabled = useNoiseSuppressionStore((s) => s.enabled)
  const available = useRnnoiseStatusStore((s) => s.available)
  const setEnabled = useNoiseSuppressionStore((s) => s.setEnabled)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-ds-md font-bold text-strong">Supressão de ruído</p>
        <Switch checked={enabled} onChange={setEnabled} label="Supressão de ruído" />
      </div>
      <p className="text-ds-sm leading-snug text-secondary">
        Ative a supressão de ruído RNNoise! Ruídos de fundo como ventilador, teclado e
        ar-condicionado são removidos enquanto você fala. Seus amigos só ouvirão a sua voz.
      </p>
      {/* Desligada não há supressão nenhuma: o aviso do fallback só vale ligada. */}
      {enabled && !available && (
        <p className="text-ds-xs text-warning">
          O RNNoise não carregou neste computador — usando a supressão padrão.
        </p>
      )}
      <div className="space-y-2">
        <p className="text-ds-sm font-bold text-strong">Teste do microfone</p>
        <MicTest />
      </div>
      <div className="flex items-end justify-between gap-3 pt-1">
        <div>
          <p className="text-ds-xs font-bold text-muted">Fornecido por</p>
          <p className="text-ds-lg font-bold tracking-tight text-strong">
            RNNoise <span className="text-ds-xs font-medium text-muted">Xiph.Org</span>
          </p>
        </div>
        <a
          href={RNNOISE_URL}
          target="_blank"
          rel="noreferrer"
          className="text-ds-sm text-link hover:underline"
        >
          Saiba mais
        </a>
      </div>
    </div>
  )
}

/** Popover acima do botão de supressão de ruído do painel "Voz conectada". */
function NoiseSuppressionPopover({
  anchor,
  onClose
}: {
  anchor: HTMLElement
  onClose: () => void
}): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)

  // Fica acima do botão, sem sair da janela (a sidebar é estreita).
  const rect = anchor.getBoundingClientRect()
  const left = Math.min(
    Math.max(MARGIN, rect.left + rect.width / 2 - POPOVER_WIDTH / 2),
    window.innerWidth - POPOVER_WIDTH - MARGIN
  )
  const bottom = window.innerHeight - rect.top + GAP

  useDismiss((target) => insideAny([ref.current, anchor], target), () => onClose())

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label="Supressão de ruído"
      style={{ width: POPOVER_WIDTH, left, bottom }}
      className="fixed z-50 rounded-xl border border-subtle bg-floating p-4 shadow-2xl"
    >
      <NoiseSuppressionSettings />
    </div>,
    document.body
  )
}

export default NoiseSuppressionPopover
