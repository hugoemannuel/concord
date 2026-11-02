import { useEffect, useReducer, useRef, type RefObject } from 'react'
import type { ServerPlugin } from '../api/plugins'
import { attachDismiss } from '../lib/dismiss'
import {
  initialPanelState,
  panelReducer,
  startLoadTimer,
  type PanelState
} from '../lib/panelState'
import Button from '../../../shared/ui/Button'
import CloseButton from '../../../shared/ui/CloseButton'
import MobileSheet from '../../../shared/ui/MobileSheet'

interface BodyProps {
  plugin: ServerPlugin
  state: PanelState
  onLoad: () => void
  onRetry: () => void
}

/** Linha de autoria, iframe isolado e o aviso de falha. */
export function PluginPanelBody({ plugin, state, onLoad, onRetry }: BodyProps): React.JSX.Element {
  return (
    <>
      <p className="shrink-0 px-4 py-2 text-ds-xs text-muted">
        Plugin de @{plugin.author_username} · conteúdo de fora da Salinha
      </p>
      <div className="relative min-h-0 flex-1">
        <iframe
          key={state.attempt}
          title={plugin.name}
          src={plugin.panel_url}
          sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
          referrerPolicy="no-referrer"
          onLoad={onLoad}
          className="size-full border-0 bg-white"
        />
        {state.status === 'failed' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-accent p-4 text-center">
            <p className="text-ds-sm text-normal">Não deu para abrir este plugin agora.</p>
            <Button variant="secondary" size="sm" onClick={onRetry}>
              Tentar de novo
            </Button>
          </div>
        )}
      </div>
    </>
  )
}

interface PanelProps {
  plugin: ServerPlugin
  onClose: () => void
  /** Botão que abriu: clicar nele não conta como fora (ele mesmo alterna). */
  anchorRef?: RefObject<HTMLElement | null>
}

export default function PluginPanel({ plugin, onClose, anchorRef }: PanelProps): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [state, dispatch] = useReducer(panelReducer, initialPanelState)

  useEffect(
    () =>
      attachDismiss(
        document,
        (n) => Boolean(ref.current?.contains(n) || anchorRef?.current?.contains(n)),
        onClose
      ),
    [onClose, anchorRef]
  )

  useEffect(() => {
    if (state.status !== 'loading') return undefined
    return startLoadTimer(() => dispatch('timeout'))
  }, [state.attempt, state.status])

  return (
    <MobileSheet>
      <div
        ref={ref}
        className="absolute right-4 top-14 z-50 flex h-[30rem] max-h-[calc(100dvh-6rem)] w-[22.5rem] flex-col rounded-xl border border-subtle bg-accent shadow-2xl"
      >
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-subtle px-4 py-2">
          <h3 className="truncate text-ds-sm font-semibold text-strong">{plugin.name}</h3>
          <CloseButton onClick={onClose} />
        </div>
        <PluginPanelBody
          plugin={plugin}
          state={state}
          onLoad={() => dispatch('loaded')}
          onRetry={() => dispatch('retry')}
        />
      </div>
    </MobileSheet>
  )
}
