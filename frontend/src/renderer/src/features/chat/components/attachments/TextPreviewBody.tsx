import { previewLines } from '../../lib/textFile'
import Button from '../../../../shared/ui/Button'

/** Aviso único de falha da prévia (cartão e visualizador). */
export const PREVIEW_FAILED = 'Não foi possível carregar a prévia.'

/** O texto cru da prévia: clicar (ou Enter) abre o visualizador. */
function TextPreviewBody({
  filename,
  text,
  expanded,
  onOpen,
  onToggle
}: {
  filename: string
  text: string
  expanded: boolean
  onOpen: () => void
  onToggle: () => void
}): React.JSX.Element {
  const { head, hasMore } = previewLines(text)
  return (
    <div className="border-t border-subtle">
      <button
        type="button"
        aria-label={filename}
        onClick={onOpen}
        className="focus-ring block w-full cursor-pointer text-left hover:bg-fg/5"
      >
        <span className="block max-h-[60vh] overflow-auto whitespace-pre p-3 font-mono text-ds-xs text-normal">
          {expanded ? text : head}
        </span>
      </button>
      {hasMore && (
        <Button variant="ghost" size="sm" className="m-2 pointer-coarse:min-h-11" onClick={onToggle}>
          {expanded ? 'Mostrar menos' : 'Mostrar mais'}
        </Button>
      )}
    </div>
  )
}

export default TextPreviewBody
