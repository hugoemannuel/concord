import { useState } from 'react'
import { Panel } from '../../observability/components/Panel'
import Button from '../../../shared/ui/Button'
import { pickStack } from '../lib/errorPanelFormat'

function stackNote(translated: boolean, canToggle: boolean): string {
  if (translated) return 'Traduzida pelos source maps.'
  return canToggle
    ? 'Pilha crua, como chegou do app.'
    : 'Sem tradução pelos source maps: pilha como chegou.'
}

/** A pilha do erro (traduzida, com a crua a um clique), rolando dentro da própria caixa. */
export function ErrorStack({
  stack,
  translated
}: {
  stack: string
  translated: string
}): React.JSX.Element {
  const [raw, setRaw] = useState(false)
  const shown = pickStack({ stack, translated }, raw)
  if (shown.text === '') {
    return (
      <Panel title="Pilha">
        <p className="text-ds-sm text-muted">Sem pilha.</p>
      </Panel>
    )
  }
  return (
    <Panel title="Pilha">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-ds-xs text-muted">{stackNote(shown.translated, shown.canToggle)}</p>
        {shown.canToggle && (
          <Button size="sm" variant="ghost" onClick={() => setRaw((r) => !r)}>
            {raw ? 'Ver pilha traduzida' : 'Ver pilha crua'}
          </Button>
        )}
      </div>
      <pre
        tabIndex={0}
        translate="no"
        aria-label="Pilha do erro"
        className="focus-ring max-h-96 overflow-auto rounded-lg bg-tertiary p-3 font-mono text-ds-xs text-normal"
      >
        {shown.text}
      </pre>
    </Panel>
  )
}
