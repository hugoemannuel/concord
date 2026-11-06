import { useAuthStore } from '../../features/auth/store/authStore'
import { API_BASE_URL } from '../lib/config'
import { ApiError, refreshTokens } from './client'

export interface UploadFile {
  field: string
  blob: Blob
  filename: string
}

/** O corpo multipart: os campos de texto (indefinido fica de fora) e depois os arquivos. */
export interface UploadForm {
  fields?: Record<string, string | number | undefined>
  files: UploadFile[]
}

/** Textos de erro de quem chama; sem eles, vale o do servidor ou o genérico. */
export interface UploadMessages {
  /** Recusa do servidor: o status e o `error` do corpo, se veio. */
  http?: (status: number, serverError: string | undefined) => string
  network?: string
  aborted?: string
}

export interface UploadOptions {
  onProgress?: (fraction: number) => void
  signal?: AbortSignal
  messages?: UploadMessages
}

const DEFAULT_MESSAGES: Required<UploadMessages> = {
  http: (_status, serverError) => serverError ?? 'Upload failed',
  network: 'Network error',
  aborted: 'aborted'
}

/**
 * Sobe arquivos em multipart para qualquer rota, com progresso, cancelamento e
 * renovação do token (401 → renova → tenta de novo uma vez). Usa
 * XMLHttpRequest porque o fetch não dá progresso de envio, e sem o limite de
 * 15 s do rawRequest (arquivo grande numa conexão lenta demora).
 */
export async function uploadTo<T>(path: string, form: UploadForm, opts: UploadOptions = {}): Promise<T> {
  const token = useAuthStore.getState().accessToken
  try {
    return await sendUpload<T>(path, form, opts, token)
  } catch (err) {
    if (err instanceof ApiError && err.status === 401 && token && (await refreshTokens(token))) {
      return sendUpload<T>(path, form, opts, useAuthStore.getState().accessToken)
    }
    throw err
  }
}

function toFormData({ fields = {}, files }: UploadForm): FormData {
  const data = new FormData()
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) data.append(key, String(value))
  }
  for (const { field, blob, filename } of files) data.append(field, blob, filename)
  return data
}

/** Corpo da resposta como objeto (vazio, não-JSON ou não-objeto viram {}). */
function parseBody(text: string): Record<string, unknown> {
  try {
    const body: unknown = JSON.parse(text)
    return body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

function httpError(status: number, body: Record<string, unknown>, messages: Required<UploadMessages>): ApiError {
  const { error, code } = body as { error?: string; code?: string }
  return new ApiError(status, messages.http(status, error), code, body)
}

function sendUpload<T>(
  path: string,
  form: UploadForm,
  { onProgress, signal, messages }: UploadOptions,
  token: string | null
): Promise<T> {
  const text = { ...DEFAULT_MESSAGES, ...messages }
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new ApiError(0, text.aborted))
      return
    }

    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${API_BASE_URL}${path}`)
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)

    const onAbort = (): void => xhr.abort()
    signal?.addEventListener('abort', onAbort)
    const settle = (fn: () => void) => (): void => {
      signal?.removeEventListener('abort', onAbort)
      fn()
    }

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && e.total > 0) onProgress?.(e.loaded / e.total)
    })
    xhr.onload = settle(() => {
      const body = parseBody(xhr.responseText)
      if (xhr.status >= 200 && xhr.status < 300) resolve(body as T)
      else reject(httpError(xhr.status, body, text))
    })
    xhr.onerror = settle(() => reject(new ApiError(0, text.network)))
    xhr.onabort = settle(() => reject(new ApiError(0, text.aborted)))
    xhr.send(toFormData(form))
  })
}
