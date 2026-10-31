import { useEffect, useState } from 'react'
import { ensureMediaToken, invalidateMediaToken } from '../../chat/store/mediaToken'
import { eventBannerUrl } from '../api/events'

/**
 * URL da imagem do banner (null sem banner ou até ter o media token) e o que
 * fazer quando a imagem falha: pedir um token novo, uma vez só.
 */
export function useBannerSrc(bannerId: string | null): { src: string | null; onError: () => void } {
  const [issued, setIssued] = useState<{ id: string; token: string } | null>(null)
  const [retried, setRetried] = useState(false)

  useEffect(() => {
    if (!bannerId) return
    let alive = true
    ensureMediaToken()
      .then((token) => alive && setIssued({ id: bannerId, token }))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [bannerId, retried])

  const src = bannerId && issued?.id === bannerId ? eventBannerUrl(bannerId, issued.token) : null
  const onError = (): void => {
    if (!issued || retried) return
    invalidateMediaToken(issued.token)
    setRetried(true)
  }
  return { src, onError }
}
