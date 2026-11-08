import type { UploadMeta } from '../api/attachments'
import type { AttachmentKind } from '../api/messages'

const META_TIMEOUT_MS = 5000

type MediaMeta = Omit<UploadMeta, 'filename'>

function readImageMeta(file: Blob): Promise<MediaMeta> {
  return createImageBitmap(file).then((bitmap) => {
    const meta = { width: bitmap.width, height: bitmap.height }
    bitmap.close()
    return meta
  })
}

function readTimedMeta(file: Blob, kind: 'video' | 'audio'): Promise<MediaMeta> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const el = document.createElement(kind)
    const cleanup = (): void => {
      clearTimeout(timer)
      el.removeAttribute('src')
      el.load()
      URL.revokeObjectURL(url)
    }
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error('metadata timeout'))
    }, META_TIMEOUT_MS)

    el.preload = 'metadata'
    el.onloadedmetadata = () => {
      const meta: MediaMeta = {}
      if (el instanceof HTMLVideoElement && el.videoWidth > 0 && el.videoHeight > 0) {
        meta.width = el.videoWidth
        meta.height = el.videoHeight
      }
      // Gravação webm do Chromium vem com duração Infinity: não manda.
      if (Number.isFinite(el.duration) && el.duration > 0) {
        meta.duration_ms = Math.round(el.duration * 1000)
      }
      cleanup()
      resolve(meta)
    }
    el.onerror = () => {
      cleanup()
      reject(new Error('metadata error'))
    }
    el.src = url
  })
}

/**
 * Largura/altura (imagem e vídeo) e duração (vídeo e áudio) lidas no próprio
 * app antes do upload, para a conversa reservar o espaço. Arquivo genérico
 * não tem nenhum dos dois. Qualquer falha → {}.
 */
export async function readMediaMeta(file: Blob, kind: AttachmentKind): Promise<MediaMeta> {
  if (kind === 'file') return {}
  try {
    if (kind === 'image') {
      let timer: ReturnType<typeof setTimeout> | undefined
      const timeout = new Promise<MediaMeta>((resolve) => {
        timer = setTimeout(() => resolve({}), META_TIMEOUT_MS)
      })
      try {
        return await Promise.race([readImageMeta(file), timeout])
      } finally {
        clearTimeout(timer)
      }
    }
    return await readTimedMeta(file, kind)
  } catch {
    return {}
  }
}
