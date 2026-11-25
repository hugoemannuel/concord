import { afterEach, describe, expect, it, vi } from 'vitest'

// Harness mínimo (sem DOM simulado): roda o efeito na hora.
const harness = vi.hoisted(() => ({ cleanup: undefined as (() => void) | undefined }))
vi.mock('react', () => ({
  useEffect: (effect: () => (() => void) | undefined) => {
    harness.cleanup = effect()
  }
}))

import { useLiveFirstFrame } from './useLiveFirstFrame'
import { noteWatchedScreens, takeFirstFrame } from '../lib/screenFirstFrame'

function video(readyState: number) {
  const listeners = new Map<string, () => void>()
  return {
    readyState,
    addEventListener: (type: string, fn: () => void) => listeners.set(type, fn),
    removeEventListener: (type: string) => listeners.delete(type),
    fire: (type: string) => listeners.get(type)?.(),
    listeners
  }
}

const stream = {} as MediaStream

afterEach(() => {
  harness.cleanup?.()
  noteWatchedScreens([])
  takeFirstFrame('bia')
})

describe('useLiveFirstFrame', () => {
  it('o primeiro quadro no <video> fecha a conta do "assistir"', () => {
    noteWatchedScreens(['bia'], performance.now())
    const el = video(0)
    useLiveFirstFrame('bia', { current: el as unknown as HTMLVideoElement }, stream)
    expect(takeFirstFrame('bia')).toBeNull()
    el.fire('loadeddata')
    expect(takeFirstFrame('bia')).not.toBeNull()
    harness.cleanup?.()
    expect(el.listeners.size).toBe(0)
  })
  it('o vídeo já tinha quadro: conta na hora', () => {
    noteWatchedScreens(['bia'], performance.now())
    useLiveFirstFrame('bia', { current: video(2) as unknown as HTMLVideoElement }, stream)
    expect(takeFirstFrame('bia')).not.toBeNull()
  })
  it('a minha live ou a câmera (sem dono remoto): nada', () => {
    const el = video(0)
    useLiveFirstFrame(null, { current: el as unknown as HTMLVideoElement }, stream)
    expect(el.listeners.size).toBe(0)
  })
})
