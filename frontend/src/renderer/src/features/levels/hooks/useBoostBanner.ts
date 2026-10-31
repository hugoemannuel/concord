import { type ActiveBoostBanner, pickBoostBanner } from '../lib/boost'
import { type BoostCelebration, useBoostStore } from '../store/boostStore'
import { useCallStore } from '../../call/store/callStore'

/**
 * O banner de ativação que vale para mim agora: fora da call do buff, ou
 * mutado/surdo (quem está pausado não ganha o buff), não há banner nem som.
 */
export function useActiveBoostBanner(): ActiveBoostBanner<BoostCelebration> | null {
  const stored = useBoostStore((s) => s.celebration)
  const callId = useCallStore((s) => s.callId)
  const paused = useCallStore((s) => s.muted || s.deafened)
  return pickBoostBanner(stored, paused, callId)
}
