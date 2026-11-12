import type { DraftAttachment } from '../lib/attachments'
import { formatBytes } from '../lib/attachments'
import { FileIcon, MicIcon, PlayIcon } from '../../../shared/ui/icons'
import CloseButton from '../../../shared/ui/CloseButton'
import ViewOnceToggle, { ViewOnceBadge } from '../viewOnce/components/ViewOnceToggle'

/** Fileira de anexos acima do campo de texto, com progresso e erro. */
function ComposerAttachments({
  drafts,
  onRemove,
  viewOnce
}: {
  drafts: DraftAttachment[]
  onRemove: (localId: string) => void
  /** Só no chat de conversa: marca o anexo como visualização única. Sem ela, nada muda. */
  viewOnce?: { on: boolean; toggle: () => void }
}): React.JSX.Element | null {
  if (drafts.length === 0) return null

  return (
    <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
      {drafts.map((d) => (
        <div
          key={d.localId}
          className={`relative flex w-40 shrink-0 flex-col gap-1 rounded-lg border bg-input p-2 ${
            d.status === 'error' ? 'border-danger/50' : 'border-subtle'
          }`}
        >
          <div className="relative flex h-20 items-center justify-center overflow-hidden rounded-md bg-fg/5 text-muted">
            {d.kind === 'image' && d.previewUrl ? (
              <img src={d.previewUrl} alt="" className="h-full w-full object-cover" />
            ) : d.kind === 'video' && d.previewUrl ? (
              <>
                <video
                  src={d.previewUrl}
                  muted
                  preload="metadata"
                  className="h-full w-full object-cover"
                />
                <PlayIcon className="absolute h-6 w-6 text-white/80" />
              </>
            ) : d.kind === 'file' ? (
              <FileIcon className="h-8 w-8" />
            ) : (
              <MicIcon className="h-8 w-8" />
            )}
          </div>
          <p className="truncate text-ds-xs text-normal" title={d.file.name}>
            {d.file.name}
          </p>
          <p className="text-ds-xxs text-faint">{formatBytes(d.file.size)}</p>
          {viewOnce?.on && <ViewOnceBadge />}
          {d.status === 'uploading' && (
            <div className="h-1 overflow-hidden rounded-full bg-fg/10">
              <div
                className="h-full rounded-full bg-brand transition-[width]"
                style={{ width: `${Math.round(d.progress * 100)}%` }}
              />
            </div>
          )}
          {d.status === 'error' && <p className="text-ds-xxs text-danger">{d.error}</p>}
          {viewOnce && (
            <div className="absolute left-1 top-1">
              <ViewOnceToggle on={viewOnce.on} onToggle={viewOnce.toggle} />
            </div>
          )}
          <CloseButton
            label="Remover anexo"
            size="xs"
            variant="media"
            className="absolute right-1 top-1"
            onClick={() => onRemove(d.localId)}
          />
        </div>
      ))}
    </div>
  )
}

export default ComposerAttachments
