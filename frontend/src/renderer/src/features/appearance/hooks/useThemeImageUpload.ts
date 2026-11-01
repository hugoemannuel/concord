import { useState } from 'react'
import { uploadThemeImage } from '../api/appThemes'
import { imageFileProblem, shrinkImage } from '../lib/themeImageFile'

export const UPLOAD_ERROR = 'Não foi possível enviar a imagem. Tente de novo.'

/** Envia a imagem de fundo escolhida (reduzida) e entrega a URL; erro vira texto. */
export function useThemeImageUpload(onDone: (url: string) => void): {
  busy: boolean
  error: string | null
  pick: (file: File) => Promise<void>
} {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pick = async (file: File): Promise<void> => {
    const problem = imageFileProblem(file)
    setError(problem)
    if (problem) return
    setBusy(true)
    try {
      onDone(await uploadThemeImage(await shrinkImage(file)))
    } catch {
      setError(UPLOAD_ERROR)
    } finally {
      setBusy(false)
    }
  }
  return { busy, error, pick }
}
