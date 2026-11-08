import { useCallback, useEffect, useRef, useState } from 'react'
import { uploadAttachment, type UploadMeta, type UploadOptions } from '../api/attachments'
import type { Attachment } from '../api/messages'
import { ApiError } from '../../../shared/api/client'
import {
  acceptFiles,
  hasVisualPreview,
  uploadErrorMessage,
  type AcceptMode,
  type DraftAttachment
} from '../lib/attachments'
import { showToast } from '../../../shared/store/toastStore'
import { readMediaMeta } from '../lib/readMediaMeta'

/** Como um arquivo sobe: `key` é a sala (ou o que identifica o destino). */
export type DraftUploader = (
  key: string,
  file: Blob,
  meta: UploadMeta,
  opts?: UploadOptions
) => Promise<Attachment>

/**
 * Anexos do campo de envio: cada arquivo começa a subir assim que entra.
 * Remover, limpar, trocar de sala ou sair cancelam o que ainda está subindo
 * (nada vai parar na sala nova) e liberam as prévias blob:. accept: 'any' no
 * chat (qualquer arquivo), 'media' nos comentários de propostas.
 */
export function useAttachmentDraft(
  room: string,
  upload: DraftUploader = uploadAttachment,
  accept: AcceptMode = 'media'
): {
  drafts: DraftAttachment[]
  addFiles: (files: File[]) => void
  remove: (localId: string) => void
  clear: () => void
} {
  const [drafts, setDrafts] = useState<DraftAttachment[]>([])
  const [draftRoom, setDraftRoom] = useState(room)
  const uploads = useRef(new Map<string, AbortController>())
  const previews = useRef(new Map<string, string>())
  // Quais há no rascunho agora (addFiles pode ser chamado de novo antes do
  // próximo render).
  const ids = useRef(new Set<string>())

  if (draftRoom !== room) {
    setDraftRoom(room)
    setDrafts([])
  }

  const release = useCallback((localId: string) => {
    uploads.current.get(localId)?.abort()
    uploads.current.delete(localId)
    const url = previews.current.get(localId)
    if (url) URL.revokeObjectURL(url)
    previews.current.delete(localId)
  }, [])

  const releaseAll = useCallback(() => {
    for (const id of [...uploads.current.keys(), ...previews.current.keys()]) release(id)
    ids.current.clear()
  }, [release])

  useEffect(() => releaseAll, [room, releaseAll])

  const update = useCallback((localId: string, patch: Partial<DraftAttachment>) => {
    setDrafts((ds) => ds.map((d) => (d.localId === localId ? { ...d, ...patch } : d)))
  }, [])

  const addFiles = useCallback(
    (files: File[]) => {
      const { accepted, errors } = acceptFiles(ids.current.size, files, accept)
      errors.forEach((msg) => showToast.error(msg))
      if (accepted.length === 0) return

      const added: DraftAttachment[] = accepted.map(({ file, kind }) => {
        const localId = crypto.randomUUID()
        ids.current.add(localId)
        const previewUrl = hasVisualPreview(kind) ? URL.createObjectURL(file) : null
        if (previewUrl) previews.current.set(localId, previewUrl)
        return { localId, file, kind, previewUrl, status: 'uploading', progress: 0 }
      })
      setDrafts((ds) => [...ds, ...added])

      for (const draft of added) {
        const controller = new AbortController()
        uploads.current.set(draft.localId, controller)
        void (async () => {
          try {
            const meta = await readMediaMeta(draft.file, draft.kind)
            if (controller.signal.aborted) return
            const attachment = await upload(
              room,
              draft.file,
              { filename: draft.file.name || 'arquivo', ...meta },
              {
                signal: controller.signal,
                onProgress: (progress) => update(draft.localId, { progress })
              }
            )
            if (controller.signal.aborted) return
            update(draft.localId, { status: 'done', progress: 1, attachment })
          } catch (err) {
            if (controller.signal.aborted) return
            const error = uploadErrorMessage(err instanceof ApiError ? err.status : 0)
            update(draft.localId, { status: 'error', error })
            showToast.error(`"${draft.file.name}": ${error}`)
          } finally {
            if (uploads.current.get(draft.localId) === controller) {
              uploads.current.delete(draft.localId)
            }
          }
        })()
      }
    },
    [room, update, upload, accept]
  )

  const remove = useCallback(
    (localId: string) => {
      release(localId)
      ids.current.delete(localId)
      setDrafts((ds) => ds.filter((d) => d.localId !== localId))
    },
    [release]
  )

  const clear = useCallback(() => {
    releaseAll()
    setDrafts([])
  }, [releaseAll])

  return { drafts, addFiles, remove, clear }
}
