import { useEffect } from 'react'
import type { BoostStage } from '../lib/boost'
import { startQuake } from '../lib/boostQuake'
import { playBoostCelebration } from '../lib/boostSounds'

/** SSS: treme a janela enquanto o banner está montado (sai junto com ele). */
export function useBoostQuake(quake: boolean): void {
  useEffect(() => {
    if (!quake) return
    return startQuake()
  }, [quake])
}

/** Toca o stinger do rank quando o banner monta (uma vez por celebração). */
export function useBoostSound(key: number, stage: BoostStage): void {
  useEffect(() => {
    playBoostCelebration(key, stage)
  }, [key, stage])
}
