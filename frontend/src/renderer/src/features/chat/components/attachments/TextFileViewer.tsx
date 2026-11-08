import type { Attachment } from '../../api/messages'
import { useTextFile } from '../../hooks/useTextFile'
import { downloadAttachment } from '../../lib/downloadFile'
import { VIEWER_BYTES, viewerTruncated } from '../../lib/textFile'
import { copyText } from '../../../../shared/lib/clipboard'
import Button from '../../../../shared/ui/Button'
import Modal from '../../../../shared/ui/Modal'
import Spinner from '../../../../shared/ui/Spinner'
import { DownloadIcon } from '../../../../shared/ui/icons'
import { PREVIEW_FAILED } from './TextPreviewBody'

/** O conteúdo do visualizador: carregando, falha ou o texto cru (com "…" se cortado). */
export function ViewerContent({
  text,
  failed,
  truncated
}: {
  text: string | null
  failed: boolean
  truncated: boolean
}): React.JSX.Element {
  if (failed) return <p className="text-ds-sm text-muted">{PREVIEW_FAILED}</p>
  if (text === null) return <Spinner className="m-6 size-6 text-muted" />
  return (
    <pre className="overflow-auto rounded-md bg-fg/5 p-3 font-mono text-ds-xs text-normal md:max-h-[65vh]">
      {truncated ? `${text}\n…` : text}
    </pre>
  )
}

/** Arquivo de texto inteiro (até 1 MB) numa janela da Salinha, com copiar e baixar. */
function TextFileViewer({
  attachment,
  onClose
}: {
  attachment: Attachment
  onClose: () => void
}): React.JSX.Element {
  const { text, failed } = useTextFile(attachment.id, VIEWER_BYTES, true)

  return (
    <Modal open wide title={attachment.filename} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <ViewerContent text={text} failed={failed} truncated={viewerTruncated(attachment.size_bytes)} />
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" disabled={text === null} onClick={() => copyText(text ?? '')}>
            Copiar
          </Button>
          <Button
            icon={DownloadIcon}
            onClick={() => void downloadAttachment(attachment).catch(() => undefined)}
          >
            Baixar
          </Button>
        </div>
      </div>
    </Modal>
  )
}

export default TextFileViewer
