import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MusicItem, MusicState } from '../api/music'

const item = (id: string, by: string, over: Partial<MusicItem> = {}): MusicItem => ({
  id,
  video_id: id,
  title: `Música ${id}`,
  artist: 'Artista',
  thumbnail: '',
  duration_ms: 125_000,
  requested_by: { id: by, username: by, display_name: by },
  has_video: false,
  video_ready: false,
  ...over
})

const store = vi.hoisted(() => ({ value: {} as Record<string, unknown> }))
vi.mock('../store/musicStore', () => ({
  useMusicStore: (select: (s: unknown) => unknown) => select(store.value)
}))
vi.mock('../../auth/store/authStore', () => ({
  useAuthStore: (select: (s: unknown) => unknown) => select({ user: { id: 'eu' } })
}))
vi.mock('../api/music', () => ({
  skipMusic: vi.fn(),
  removeQueueItem: vi.fn(),
  swapQueueItems: vi.fn()
}))
vi.mock('./MusicVideo', () => ({ default: () => <i data-video /> }))

import { renderToStaticMarkup } from 'react-dom/server'
import MusicPanel from './MusicPanel'

function music(over: Partial<MusicState> = {}): MusicState {
  return {
    call_id: 'c',
    channel_id: 'ch',
    server_id: 's',
    server_time: 0,
    now: { item: item('n', 'eu', { has_video: true }), started_at: 0 },
    queue: [],
    skip: { votes: 1, needed: 2, voters: [] },
    ...over
  }
}

const render = (state: MusicState | null, panelOpen = true): string => {
  store.value = {
    state,
    panelOpen,
    closePanel: vi.fn(),
    duckingEnabled: true,
    setDucking: vi.fn(),
    videoEnabled: false,
    setVideoEnabled: vi.fn(),
    stageVideo: false,
    setStageVideo: vi.fn(),
    serverOffsetMs: 0
  }
  return renderToStaticMarkup(<MusicPanel serverId="s" />)
}

describe('MusicPanel', () => {
  beforeEach(() => {
    store.value = {}
  })

  it('sem música no canal, nada', () => {
    expect(render(null)).toBe('')
  })

  it('aberto: tocando agora com vídeo, pular (minha música), fila vazia e os interruptores', () => {
    const html = render(music())
    expect(html).toContain('aria-hidden="false"')
    expect(html).toContain('translate-x-0 opacity-100')
    expect(html).toContain('Tocando agora')
    expect(html).toContain('aria-label="Fechar"')
    expect(html).toContain('data-video')
    expect(html).toContain('Ver vídeo')
    expect(html).toContain('Tela cheia')
    expect(html).toContain('Música n')
    expect(html).toContain('Artista · @eu')
    expect(html).toContain('2:05')
    expect(html).toMatch(/<button type="button" class="[^"]*">Pular<\/button>/)
    expect(html).toContain('Nada na fila. Use /play')
    expect(html).toContain('Mostrar vídeo no painel')
    expect(html).toContain('Abaixar música quando alguém fala')
  })

  it('fechado: escondido e sem o vídeo do painel', () => {
    const html = render(music(), false)
    expect(html).toContain('aria-hidden="true"')
    expect(html).toContain('pointer-events-none invisible')
    expect(html).not.toContain('data-video')
  })

  it('música de outra pessoa: votar; já votei, travado; sem vídeo, sem os botões de vídeo', () => {
    const now = { item: item('n', 'outro'), started_at: 0 }
    expect(render(music({ now }))).toMatch(
      /<button type="button" class="[^"]*">Votar para pular · 1\/2</
    )
    const html = render(music({ now, skip: { votes: 1, needed: 2, voters: ['eu'] } }))
    expect(html).toMatch(/disabled=""[^>]*>Votar para pular/)
    expect(html).not.toContain('Ver vídeo')
  })

  it('sem nada tocando, só a fila', () => {
    const html = render(music({ now: null, queue: [item('a', 'eu')] }))
    expect(html).not.toContain('music-now-title')
    expect(html).toContain('Música a')
  })

  it('fila: as minhas arrastáveis e removíveis, a prévia recolhida e "Ver mais"', () => {
    const queue = [
      item('a', 'eu'),
      item('b', 'outro'),
      item('c', 'eu'),
      item('d', 'eu'),
      item('e', 'eu')
    ]
    const html = render(music({ queue }))
    expect(html).toMatch(/<li draggable="true" class="[^"]*cursor-grab/)
    expect(html).toMatch(/<li draggable="false" class="[^"]*opacity-80/)
    expect(html.match(/aria-label="Remover"/g)).toHaveLength(2)
    expect(html).toContain('Música c')
    expect(html).not.toContain('Música d')
    expect(html).toContain('aria-expanded="false"')
    expect(html).toContain('Ver mais (2)')
  })
})
