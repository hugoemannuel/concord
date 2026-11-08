import type { ReactNode } from 'react'
import type { Attachment } from '../../api/messages'
import { formatBytes } from '../../lib/attachments'
import { downloadAttachment } from '../../lib/downloadFile'
import IconButton from '../../../../shared/ui/IconButton'
import { DownloadIcon, FileIcon } from '../../../../shared/ui/icons'

/**
 * Cartão de um arquivo do chat: ícone, nome, tamanho e baixar. children vai
 * embaixo (a prévia de um arquivo de texto).
 */
function FileCard({
  attachment,
  children
}: {
  attachment: Attachment
  children?: ReactNode
}): React.JSX.Element {
  return (
    <div className="w-full max-w-[432px] overflow-hidden rounded-lg border border-subtle bg-fg/5">
      <div className="flex items-center gap-3 p-3">
        <FileIcon size={24} className="shrink-0 text-muted" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-ds-sm font-medium text-strong" title={attachment.filename}>
            {attachment.filename}
          </p>
          <p className="text-ds-xs text-faint">{formatBytes(attachment.size_bytes)}</p>
        </div>
        <IconButton
          icon={DownloadIcon}
          label={`Baixar ${attachment.filename}`}
          size="lg"
          onClick={() => void downloadAttachment(attachment).catch(() => undefined)}
        />
      </div>
      {children}
    </div>
  )
}

export default FileCard
