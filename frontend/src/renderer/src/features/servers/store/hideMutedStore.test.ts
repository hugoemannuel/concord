import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useHideMutedStore } from './hideMutedStore'

const saved = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (key: string) => saved.get(key) ?? null,
  setItem: (key: string, value: string) => saved.set(key, value)
})

describe('hideMutedStore', () => {
  beforeEach(() => {
    saved.clear()
    useHideMutedStore.setState({ byKey: {} })
  })

  it('começa desligado e alterna', () => {
    const store = useHideMutedStore.getState()
    expect(store.isOn('ana', 's1')).toBe(false)
    store.toggle('ana', 's1')
    expect(store.isOn('ana', 's1')).toBe(true)
    store.toggle('ana', 's1')
    expect(store.isOn('ana', 's1')).toBe(false)
  })

  it('é de cada pessoa em cada servidor', () => {
    const store = useHideMutedStore.getState()
    store.toggle('ana', 's1')
    expect(store.isOn('bia', 's1')).toBe(false)
    expect(store.isOn('ana', 's2')).toBe(false)
  })

  it('volta depois de reabrir o app', () => {
    useHideMutedStore.getState().toggle('ana', 's1')
    useHideMutedStore.setState({ byKey: {} })
    expect(useHideMutedStore.getState().isOn('ana', 's1')).toBe(true)
  })

  it('sem armazenamento, vale só na sessão', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('bloqueado')
      },
      setItem: () => {
        throw new Error('bloqueado')
      }
    })
    const store = useHideMutedStore.getState()
    expect(store.isOn('ana', 's3')).toBe(false)
    store.toggle('ana', 's3')
    expect(store.isOn('ana', 's3')).toBe(true)
    vi.stubGlobal('localStorage', { getItem: (key: string) => saved.get(key) ?? null, setItem: (key: string, value: string) => saved.set(key, value) })
  })
})
