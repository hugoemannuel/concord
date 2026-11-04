import { useEffect, useState } from 'react'
import { stickerFileUrl } from '../api/stickers'
import { ensureMediaToken } from '../store/mediaToken'

/** URL da figurinha, com o media token (null até ele chegar). */
export function useStickerSrc(stickerId: string): string | null {
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    ensureMediaToken()
      .then((token) => {
        if (active) setSrc(stickerFileUrl(stickerId, token))
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [stickerId])
  return src
}
