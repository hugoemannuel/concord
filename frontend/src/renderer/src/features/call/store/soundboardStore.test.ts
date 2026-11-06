import { beforeEach, describe, expect, it, vi } from 'vitest'

const sentEvents = vi.hoisted(() => [] as Array<{ type: string; payload: unknown }>)

vi.mock('../lib/rtc', () => ({
  getAudioStream: vi.fn(),
  getCameraStream: vi.fn(),
  getDisplayStream: vi.fn()
}))

vi.mock('../../chat/store/chatStore', () => ({
  useChatStore: {
    getState: () => ({
      sendEvent: (type: string, payload: unknown) => sentEvents.push({ type, payload }),
      subscribeRoom: vi.fn(),
      unsubscribeRoom: vi.fn(),
      isWsConnected: () => true
    })
  }
}))

// Cada teste reimporta o store (e o callStore, pesado) do zero com vi.resetModules;
// sob cobertura e com a suíte em paralelo isso passa dos 5s padrão.
vi.setConfig({ testTimeout: 30_000 })

function memoryStorage(): Storage {
  const data = new Map<string, string>()
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
    clear: () => data.clear(),
    key: (i) => [...data.keys()][i] ?? null,
    get length() {
      return data.size
    }
  }
}

beforeEach(() => {
  globalThis.localStorage = memoryStorage()
  sentEvents.length = 0
  vi.resetModules()
})

describe('soundboardStore', () => {
  it('persiste volume e atalhos no localStorage', async () => {
    const first = await import('./soundboardStore')
    const store = first.useSoundboardStore.getState()
    expect(store.volume).toBe(0.8)

    store.setVolume(0.45)
    store.setKeybind('snd-1', 'Alt+1')
    store.setKeybind('snd-2', 'Alt+1') // substitui o conflito em snd-1

    vi.resetModules()
    const second = await import('./soundboardStore')
    const state = second.useSoundboardStore.getState()
    expect(state.volume).toBe(0.45)
    expect(state.keybinds['snd-1']).toBeUndefined()
    expect(state.keybinds['snd-2']).toBe('Alt+1')
  })

  it('salvar as preferências não apaga os favoritos antigos ainda não levados ao servidor', async () => {
    localStorage.setItem('concord:soundboard-prefs', JSON.stringify({ favorites: ['snd-1'] }))
    const { useSoundboardStore } = await import('./soundboardStore')
    useSoundboardStore.getState().setVolume(0.3)
    const saved = JSON.parse(localStorage.getItem('concord:soundboard-prefs') ?? '{}')
    expect(saved).toEqual({ favorites: ['snd-1'], volume: 0.3, keybinds: {} })
  })

  it('som apagado sai também dos favoritos', async () => {
    const { useSoundboardStore } = await import('./soundboardStore')
    const { useSoundFavoritesStore } = await import('./soundFavoritesStore')
    useSoundFavoritesStore.setState({
      favorites: [
        { id: 'snd-9', server_name: 'B' } as never,
        { id: 'snd-8', server_name: 'B' } as never
      ]
    })
    useSoundboardStore.getState().handleWsEvent({
      type: 'soundboard:deleted',
      payload: { server_id: 'srv-b', sound_id: 'snd-9' }
    })
    expect(useSoundFavoritesStore.getState().favorites.map((f) => f.id)).toEqual(['snd-8'])
  })

  it('atualiza lista ao receber soundboard:created e soundboard:deleted', async () => {
    const { useSoundboardStore } = await import('./soundboardStore')
    useSoundboardStore.getState().handleWsEvent({
      type: 'soundboard:created',
      payload: {
        server_id: 'srv-1',
        sound: {
          id: 'snd-10',
          server_id: 'srv-1',
          uploader_id: 'u1',
          uploader_name: 'Alice',
          name: 'Corneta',
          emoji: '🎺',
          content_type: 'audio/wav',
          size_bytes: 4096,
          duration_ms: 1500,
          created_at: new Date().toISOString()
        }
      }
    })

    expect(useSoundboardStore.getState().soundsByServer['srv-1']).toHaveLength(1)

    useSoundboardStore.getState().handleWsEvent({
      type: 'soundboard:deleted',
      payload: {
        server_id: 'srv-1',
        sound_id: 'snd-10'
      }
    })

    expect(useSoundboardStore.getState().soundsByServer['srv-1']).toHaveLength(0)
  })

  it('updateSound e soundboard:updated trocam nome e emoji na lista do servidor', async () => {
    const editApi = await import('../../expressions/api/expressions')
    const { useSoundboardStore } = await import('./soundboardStore')
    const corneta = {
      id: 'snd-1',
      server_id: 'srv-1',
      uploader_id: 'u1',
      uploader_name: 'Alice',
      name: 'Corneta',
      emoji: 'x',
      content_type: 'audio/wav',
      size_bytes: 4096,
      duration_ms: 1500,
      created_at: '2026-11-01T00:00:00Z'
    }
    useSoundboardStore.setState({ soundsByServer: { 'srv-1': [corneta] } })
    const renamed = { ...corneta, name: 'Buzina', emoji: null }
    const update = vi.spyOn(editApi, 'updateServerSound').mockResolvedValue(renamed)
    await expect(
      useSoundboardStore.getState().updateSound('srv-1', 'snd-1', { name: 'Buzina', emoji: '' })
    ).resolves.toEqual(renamed)
    expect(update).toHaveBeenCalledWith('srv-1', 'snd-1', { name: 'Buzina', emoji: '' })
    expect(useSoundboardStore.getState().soundsByServer['srv-1']).toEqual([renamed])

    useSoundboardStore.getState().handleWsEvent({
      type: 'soundboard:updated',
      payload: { server_id: 'srv-1', sound: { ...corneta, name: 'Apito' } }
    })
    expect(useSoundboardStore.getState().soundsByServer['srv-1'][0].name).toBe('Apito')
    useSoundboardStore.getState().handleWsEvent({ type: 'soundboard:updated', payload: { server_id: 'srv-1' } })
    expect(useSoundboardStore.getState().soundsByServer['srv-1']).toHaveLength(1)
  })

  it('loadMine traz os sons de todos os servidores da pessoa sem apagar os já carregados', async () => {
    const api = await import('../api/soundboard')
    const { useSoundboardStore } = await import('./soundboardStore')
    const snd = (id: string, server: string) => ({
      id,
      server_id: server,
      uploader_id: 'u1',
      uploader_name: 'Alice',
      name: id,
      content_type: 'audio/wav',
      size_bytes: 1,
      duration_ms: 1000,
      created_at: '2026-11-01T00:00:00Z'
    })
    useSoundboardStore.setState({ soundsByServer: { visita: [snd('v1', 'visita')] } })
    vi.spyOn(api, 'listMySounds').mockResolvedValue([
      { server_id: 'srv-1', server_name: 'Um', sounds: [snd('a1', 'srv-1')] },
      { server_id: 'srv-2', server_name: 'Dois', sounds: [snd('b1', 'srv-2')] }
    ])
    await useSoundboardStore.getState().loadMine()
    const byServer = useSoundboardStore.getState().soundsByServer
    expect(Object.keys(byServer).sort()).toEqual(['srv-1', 'srv-2', 'visita'])
    expect(byServer['srv-2'].map((s) => s.id)).toEqual(['b1'])
  })

  it('loadMine sem rede mantém o que já tinha', async () => {
    const api = await import('../api/soundboard')
    const { useSoundboardStore } = await import('./soundboardStore')
    useSoundboardStore.setState({ soundsByServer: { 'srv-1': [] } })
    vi.spyOn(api, 'listMySounds').mockRejectedValue(new Error('offline'))
    await useSoundboardStore.getState().loadMine()
    expect(useSoundboardStore.getState().soundsByServer).toEqual({ 'srv-1': [] })
  })

  it('registra activePlays ao receber call:soundboard e envia evento em triggerSound', async () => {
    const { useCallStore } = await import('./callStore')
    const { useSoundboardStore } = await import('./soundboardStore')

    useCallStore.setState({
      status: 'active',
      type: 'channel',
      callId: 'call-123',
      serverId: 'srv-1',
      muted: false,
      deafened: true // surdo: não tenta criar HTMLAudioElement, mas exibe indicador visual
    })

    useSoundboardStore.getState().handleWsEvent({
      type: 'call:soundboard',
      payload: {
        call_id: 'call-123',
        sound: {
          id: 'snd-1',
          server_id: 'srv-1',
          name: 'Risada',
          emoji: '😂',
          duration_ms: 1200
        },
        user: {
          id: 'user-99',
          username: 'bob',
          display_name: 'Bob'
        }
      }
    })

    const play = useSoundboardStore.getState().activePlays['user-99']
    expect(play).toBeDefined()
    expect(play.soundName).toBe('Risada')
    expect(play.emoji).toBe('😂')

    // Desensurdece e dispara um som
    useCallStore.setState({ deafened: false, muted: false })
    useSoundboardStore.getState().triggerSound('snd-1')
    expect(sentEvents).toEqual([
      {
        type: 'call:soundboard',
        payload: { call_id: 'call-123', sound_id: 'snd-1' }
      }
    ])

    useSoundboardStore.getState().clearActivePlays()
    expect(useSoundboardStore.getState().activePlays['user-99']).toBeUndefined()
  })
})
