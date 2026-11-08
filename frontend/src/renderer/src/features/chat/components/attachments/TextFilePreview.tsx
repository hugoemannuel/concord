import { useRef, useState } from 'react'
import type { Attachment } from '../../api/messages'
import { useNearViewport } from '../../hooks/useNearViewport'
import { useTextFile } from '../../hooks/useTextFile'
import { PREVIEW_BYTES } from '../../lib/textFile'
import FileCard from './FileCard'
import TextFileViewer from './TextFileViewer'
import TextPreviewBody, { PREVIEW_FAILED } from './TextPreviewBody'

/**
 * Arquivo de texto (o servidor viu UTF-8): o cartão com o começo do conteúdo,
 * cru. Baixa só perto da tela; clicar na prévia abre o visualizador.
 */
function TextFilePreview({ attachment }: { attachment: Attachment }): React.JSX.Element {
  const boxRef = useRef<HTMLDivElement>(null)
  const near = useNearViewport(boxRef)
  const { text, failed } = useTextFile(attachment.id, PREVIEW_BYTES, near)
  const [expanded, setExpanded] = useState(false)
  const [viewerOpen, setViewerOpen] = useState(false)

  return (
    <div ref={boxRef} className="w-full max-w-[432px]">
      <FileCard attachment={attachment}>
        {failed && <p className="border-t border-subtle p-3 text-ds-xs text-muted">{PREVIEW_FAILED}</p>}
        {text !== null && (
          <TextPreviewBody
            filename={attachment.filename}
            text={text}
            expanded={expanded}
            onOpen={() => setViewerOpen(true)}
            onToggle={() => setExpanded((v) => !v)}
          />
        )}
      </FileCard>
      {viewerOpen && <TextFileViewer attachment={attachment} onClose={() => setViewerOpen(false)} />}
    </div>
  )
}

export default TextFilePreview
