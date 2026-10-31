import type { BoostRank } from '../lib/boost'
import { useBoostQuake, useBoostSound } from '../hooks/useBoostEffects'

/**
 * Efeitos do banner que não são desenho: o som do rank e a tremida do SSS.
 * Monta junto com o banner e desmonta quando ele acaba (a tremida para junto).
 */
function BoostBannerEffects({
  celebrationKey,
  rank
}: {
  celebrationKey: number
  rank: BoostRank
}): null {
  useBoostQuake(rank.quake)
  useBoostSound(celebrationKey, rank.stage)
  return null
}

export default BoostBannerEffects
