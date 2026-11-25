import { useEffect } from 'react'
import { noteFirstFrame } from '../lib/screenFirstFrame'

/** readyState a partir do qual o <video> já tem o quadro atual (HAVE_CURRENT_DATA). */
const HAS_FRAME = 2

/**
 * Avisa a telemetria quando o <video> da live de `userId` mostra o primeiro
 * quadro (docs/adr/0074). null = não é live de outra pessoa.
 */
export function useLiveFirstFrame(
  userId: string | null,
  ref: React.RefObject<HTMLVideoElement | null>,
  stream: MediaStream
): void {
  useEffect(() => {
    const el = ref.current
    if (!userId || !el) return
    const done = (): void => noteFirstFrame(userId)
    if (el.readyState >= HAS_FRAME) {
      done()
      return
    }
    el.addEventListener('loadeddata', done)
    return () => el.removeEventListener('loadeddata', done)
  }, [userId, ref, stream])
}
