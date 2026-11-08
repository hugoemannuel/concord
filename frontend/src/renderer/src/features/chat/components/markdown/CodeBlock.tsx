import { useEffect, useState } from 'react'
import IconButton from '../../../../shared/ui/IconButton'
import { CheckIcon, CopyIcon } from '../../../../shared/ui/icons'
import { copyText } from '../../../../shared/lib/clipboard'

/** Tempo do "Copiado" no botão antes de voltar a "Copiar código". */
const COPIED_MS = 2000

/**
 * Bloco de código: fonte monoespaçada, rola na horizontal por dentro (nunca
 * alarga a linha da mensagem) e botão de copiar. Sem cores de sintaxe. O botão
 * aparece no hover/foco com mouse e fica sempre visível no toque.
 */
export default function CodeBlock({ text }: { text: string }): React.JSX.Element {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), COPIED_MS)
    return () => clearTimeout(timer)
  }, [copied])

  return (
    <div className="group relative my-1 min-w-0 max-w-full">
      <pre className="overflow-x-auto whitespace-pre rounded-lg border border-subtle bg-tertiary p-2 pr-11 font-mono text-ds-sm text-normal">
        <code>{text}</code>
      </pre>
      <IconButton
        icon={copied ? CheckIcon : CopyIcon}
        label={copied ? 'Copiado' : 'Copiar código'}
        size="sm"
        variant="filled"
        onClick={() => {
          copyText(text)
          setCopied(true)
        }}
        className="absolute right-1 top-1 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:focus-visible:opacity-100"
      />
    </div>
  )
}
