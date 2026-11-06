import { describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  perms: 0,
  viewing: 'srv-a',
  server: [] as Array<Record<string, unknown>>,
  other: [] as Array<Record<string, unknown>>,
  favorites: [] as Array<Record<string, unknown>>
}))

// O atalho de teclado importa o callStore (pesado, com áudio do navegador).
vi.mock('../store/callStore', () => ({ useCallStore: vi.fn() }))
vi.mock('../../servers/store/serverStore', () => ({
  useServerStore: (sel: (s: Record<string, unknown>) => unknown) =>
    sel({
      currentServer: { id: state.viewing },
      servers: [
        { id: 'srv-b', name: 'Servidor B' },
        { id: 'srv-a', name: 'Servidor A' }
      ]
    })
}))
vi.mock('../../servers/hooks/useServerAccess', () => ({
  useServerAccess: () => ({
    can: (want: number) => (state.perms & want) === want,
    canInChannel: (_: string, want: number) => (state.perms & want) === want
  })
}))
vi.mock('../../auth/store/authStore', () => ({
  useAuthStore: (sel: (s: { user: { id: string } }) => unknown) => sel({ user: { id: 'eu' } })
}))
vi.mock('../store/soundboardStore', () => ({
  useSoundboardStore: (sel: (s: Record<string, unknown>) => unknown) =>
    sel({
      soundsByServer: { 'srv-a': state.server, 'srv-b': state.other },
      loadingByServer: {},
      volume: 0.8,
      keybinds: {},
      activePlays: {},
      setVolume: vi.fn(),
      setKeybind: vi.fn(),
      loadServerSounds: vi.fn(),
      loadMine: vi.fn(),
      deleteSound: vi.fn(),
      triggerSound: vi.fn()
    })
}))
vi.mock('../store/soundFavoritesStore', () => ({
  useSoundFavoritesStore: (sel: (s: Record<string, unknown>) => unknown) =>
    sel({ favorites: state.favorites, load: vi.fn(), toggle: vi.fn() })
}))
vi.mock('./SoundboardUploadModal', () => ({ default: () => null }))

import { renderToStaticMarkup } from 'react-dom/server'
import SoundboardSoundsPanel from './SoundboardSoundsPanel'
import { Perm } from '../../servers/lib/permissions'
import { StarIcon } from '../../../shared/ui/icons'

const sound = (id: string, name: string, server = 'srv-a'): Record<string, unknown> => ({
  id,
  name,
  server_id: server,
  uploader_id: 'ana',
  uploader_name: 'Ana',
  content_type: 'audio/wav',
  size_bytes: 1,
  duration_ms: 1500,
  created_at: ''
})

const render = (): string =>
  renderToStaticMarkup(<SoundboardSoundsPanel serverId="srv-a" onBusyChange={() => {}} />)

describe('SoundboardSoundsPanel', () => {
  it('favoritos primeiro e depois uma seção por servidor, o da chamada antes', () => {
    state.perms = Perm.ADD_SOUNDS | Perm.USE_SOUNDBOARD
    state.server = [sound('a1', 'Buzina'), sound('a2', 'Corneta')]
    state.other = [sound('b1', 'Bateria', 'srv-b'), sound('b2', 'Apito', 'srv-b')]
    state.favorites = [
      { ...sound('b1', 'Bateria', 'srv-b'), server_name: 'Servidor B' },
      { ...sound('a2', 'Corneta'), server_name: 'Servidor A' }
    ]
    const html = render()
    // A estrela é o ícone desenhado, não o caractere ★.
    expect(html).not.toContain('★')
    const star = renderToStaticMarkup(<StarIcon filled size={12} className="shrink-0" />)
    expect(html).toContain(star)
    // Ordem: favoritos, o servidor da chamada, os outros servidores.
    const at = (text: string): number => html.indexOf(text)
    expect(at('Bateria')).toBeLessThan(at('Buzina'))
    expect(at('Buzina')).toBeLessThan(at('Apito'))
    expect(html).toContain('>Servidor A<')
    expect(html).toContain('>Servidor B<')
    // O favorito não repete na seção do servidor.
    expect(html.match(/>Corneta</g)?.length).toBe(1)
    expect(html.match(/>Bateria</g)?.length).toBe(1)
    expect(html).toContain('Favoritar som')
  })

  it('o trilho leva aos favoritos e a cada servidor', () => {
    const html = render()
    expect(html).toContain('aria-label="Ir para a seção"')
    expect(html).toContain('aria-label="Favoritos"')
    expect(html).toContain('aria-label="Servidor A"')
    expect(html).toContain('aria-label="Servidor B"')
  })

  it('sem "Adicionar sons" esconde o envio', () => {
    state.perms = Perm.USE_SOUNDBOARD
    state.server = []
    state.other = []
    state.favorites = []
    const html = render()
    expect(html).not.toContain('Adicionar som')
    expect(html).toContain('Nenhum som neste servidor ainda.')
  })

  it('com "Adicionar sons" mostra o envio', () => {
    state.perms = Perm.ADD_SOUNDS
    expect(render()).toContain('Adicionar som')
  })

  it('lixeira: o que é seu em qualquer servidor; dos outros, só aqui e com Gerenciar expressões', () => {
    state.perms = Perm.MANAGE_EXPRESSIONS
    state.server = [sound('a1', 'Buzina')]
    state.other = [sound('b1', 'Bateria', 'srv-b'), { ...sound('b2', 'Meu', 'srv-b'), uploader_id: 'eu' }]
    state.favorites = []
    const html = render()
    expect(html).toContain('Excluir som Buzina')
    expect(html).toContain('Excluir som Meu')
    expect(html).not.toContain('Excluir som Bateria')
  })
})
