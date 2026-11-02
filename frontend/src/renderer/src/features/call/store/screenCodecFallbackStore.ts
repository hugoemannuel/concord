import { create } from 'zustand'
import type { ScreenVideoCodec } from '../lib/screenCodecSupport'

// A minha live trocou de codec porque o publicado falhou no navegador (ver
// screenCodecGuard). Lido pelo painel "Sua transmissão"; fora do callStore.

export interface CodecFallback {
  /** O codec publicado primeiro, que falhou ('h265'). */
  from: ScreenVideoCodec
  /** O codec em que a live saiu de novo ('h264'). */
  to: ScreenVideoCodec
}

interface ScreenCodecFallbackState {
  fallback: CodecFallback | null
  setFallback: (fallback: CodecFallback | null) => void
}

export const useScreenCodecFallbackStore = create<ScreenCodecFallbackState>((set) => ({
  fallback: null,
  setFallback: (fallback) => set({ fallback })
}))
