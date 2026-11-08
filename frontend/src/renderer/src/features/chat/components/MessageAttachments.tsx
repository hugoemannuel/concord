import { useRef, useState } from 'react'
import type { Attachment } from '../api/messages'
import { fitMedia, formatBytes, groupAttachments, isTextFile } from '../lib/attachments'
import { imageMenuHandler } from '../store/imageMenuStore'
import { PlayIcon } from '../../../shared/ui/icons'
import AudioPlayer from './AudioPlayer'
import MediaLightbox from './MediaLightbox'
import FileCard from './attachments/FileCard'
import TextFilePreview from './attachments/TextFilePreview'
import { useMediaSrc } from '../hooks/useMediaSrc'
import { useNearViewport } from '../hooks/useNearViewport'

/** Imagem/gif: espaço reservado já no tamanho final; baixa só perto da tela. */
function ImageAttachment({
  attachment,
  copyImages
}: {
  attachment: Attachment
  copyImages: boolean
}): React.JSX.Element {
  const boxRef = useRef<HTMLButtonElement>(null)
  const near = useNearViewport(boxRef)
  const { src, onError, failed } = useMediaSrc(attachment.id, near, attachment.url)
  const [open, setOpen] = useState(false)
  const box = fitMedia(attachment.width, attachment.height)
  const onMenu = copyImages ? imageMenuHandler(attachment.id, attachment.content_type) : undefined

  return (
    <>
      <button
        ref={boxRef}
        type="button"
        onClick={() => src && !failed && setOpen(true)}
        onContextMenu={onMenu}
        title={attachment.filename}
        style={{ width: box.width, height: box.height }}
        className="relative max-w-full cursor-zoom-in overflow-hidden rounded-md bg-fg/5"
      >
        {failed ? (
          <span className="flex h-full w-full items-center justify-center p-2 text-center text-xs text-gray-400">
            Não foi possível carregar a imagem.
          </span>
        ) : (
          src && (
            <img
              src={src}
              alt={attachment.filename}
              decoding="async"
              draggable={false}
              onError={onError}
              className="h-full w-full rounded-md object-cover"
            />
          )
        )}
      </button>
      {open && src && (
        <MediaLightbox
          src={src}
          alt={attachment.filename}
          onClose={() => setOpen(false)}
          onContextMenu={onMenu}
        />
      )}
    </>
  )
}

/** Vídeo: nada é pedido ao servidor até o clique no play. */
function VideoAttachment({ attachment }: { attachment: Attachment }): React.JSX.Element {
  const [activated, setActivated] = useState(false)
  const { src, onError, failed } = useMediaSrc(attachment.id, activated, attachment.url)
  // Token vencido no meio do vídeo: recarrega com token novo do mesmo ponto.
  const resumeAt = useRef(0)
  const box = fitMedia(attachment.width, attachment.height)

  return (
    <div
      style={{ width: box.width, height: box.height }}
      className="relative max-w-full overflow-hidden rounded-md bg-black/60 on-media"
    >
      {activated && src && !failed ? (
        <video
          src={src}
          controls
          autoPlay
          preload="none"
          onError={(e) => {
            resumeAt.current = e.currentTarget.currentTime
            onError()
          }}
          onLoadedMetadata={(e) => {
            if (resumeAt.current > 0) e.currentTarget.currentTime = resumeAt.current
            resumeAt.current = 0
          }}
          className="h-full w-full rounded-md bg-black"
        />
      ) : (
        <button
          type="button"
          onClick={() => setActivated(true)}
          disabled={failed}
          aria-label={`Reproduzir ${attachment.filename}`}
          className="flex h-full w-full cursor-pointer flex-col items-center justify-center gap-2 text-gray-300 transition-colors hover:text-strong disabled:cursor-default"
        >
          {failed ? (
            <span className="p-2 text-center text-xs text-gray-400">
              Não foi possível carregar o vídeo.
            </span>
          ) : (
            <>
              <span className="rounded-full bg-black/60 p-3 on-media">
                <PlayIcon className="h-8 w-8" />
              </span>
              <span className="max-w-[90%] truncate text-xs">{attachment.filename}</span>
              <span className="text-[10px] text-gray-400">
                {activated ? 'Carregando...' : formatBytes(attachment.size_bytes)}
              </span>
            </>
          )}
        </button>
      )}
    </div>
  )
}

/**
 * Anexos de uma mensagem: imagens e vídeos lado a lado; áudios e arquivos um
 * por linha (arquivo de texto com prévia, o resto como cartão para baixar).
 * copyImages liga o "Copiar imagem" no botão direito das imagens (chat).
 */
function MessageAttachments({
  attachments,
  copyImages = false
}: {
  attachments: Attachment[]
  copyImages?: boolean
}): React.JSX.Element {
  const { visual, audios, files } = groupAttachments(attachments)

  return (
    <div data-message-media className="mt-1 flex flex-col gap-2">
      {visual.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {visual.map((a) =>
            a.kind === 'image' ? (
              <ImageAttachment key={a.id} attachment={a} copyImages={copyImages} />
            ) : (
              <VideoAttachment key={a.id} attachment={a} />
            )
          )}
        </div>
      )}
      {audios.map((a) => (
        <AudioPlayer key={a.id} attachment={a} />
      ))}
      {files.map((a) =>
        isTextFile(a) ? <TextFilePreview key={a.id} attachment={a} /> : <FileCard key={a.id} attachment={a} />
      )}
    </div>
  )
}

export default MessageAttachments
