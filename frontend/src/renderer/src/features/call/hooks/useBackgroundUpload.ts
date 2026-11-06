import { errorMessage } from '../../../shared/lib/errorMessage'
import { useState } from 'react'
import { readBackgroundFile } from '../lib/backgroundImage'

/**
 * Lê o arquivo escolhido (imagem reduzida ou GIF inteiro) e entrega a quem
 * guarda; qualquer erro vira texto para a tela.
 */
export function useBackgroundUpload(
  onImage: (dataUrl: string) => void,
  onGif: (blob: Blob) => Promise<unknown>
): {
  upload: (file: File) => void
  error: string | null
} {
  const [error, setError] = useState<string | null>(null)
  const upload = (file: File): void => {
    void (async () => {
      try {
        const read = await readBackgroundFile(file)
        if (read.kind === 'gif') await onGif(read.blob)
        else onImage(read.dataUrl)
        setError(null)
      } catch (err) {
        setError(errorMessage(err, 'Não foi possível ler a imagem.'))
      }
    })()
  }
  return { upload, error }
}
