import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  perms: 0,
  viewing: 's1',
  stickers: {} as Record<string, unknown[]>,
  servers: [
    { id: 's1', name: 'Alfa' },
    { id: 's2', name: 'Beta' }
  ]
}))
vi.mock('../../servers/hooks/useServerAccess', () => ({
  useServerAccess: () => ({
    can: (want: number) => (state.perms & want) >>> 0 === want >>> 0,
    canInChannel: (_: string, want: number) => (state.perms & want) >>> 0 === want >>> 0
  })
}))
vi.mock('../../servers/store/serverStore', () => ({
  useServerStore: (sel: (s: unknown) => unknown) =>
    sel({ currentServer: { id: state.viewing }, servers: state.servers, roles: [{}] })
}))
vi.mock('../../auth/store/authStore', () => ({
  useAuthStore: (sel: (s: { user: { id: string } }) => unknown) => sel({ user: { id: 'eu' } })
}))
vi.mock('../store/stickerStore', () => ({
  useStickerStore: (sel: (s: unknown) => unknown) =>
    sel({ deleteSticker: vi.fn(), stickersByServer: state.stickers })
}))

import { renderToStaticMarkup } from 'react-dom/server'
import StickersTab from './StickersTab'
import { Perm } from '../../servers/lib/permissions'

const render = (props: { serverId?: string | null; search?: string } = {}): string =>
  renderToStaticMarkup(
    <StickersTab serverId="s1" channelId="c1" search="" onAdd={() => {}} onSelectSticker={() => {}} {...props} />
  )

const sticker = (id: string, serverId: string, name: string): unknown => ({
  id,
  server_id: serverId,
  uploader_id: 'bia',
  name,
  content_type: 'image/png',
  size_bytes: 1,
  created_at: ''
})
const REASON = 'Você não tem permissão para usar itens de outros servidores aqui.'

describe('StickersTab', () => {
  beforeEach(() => {
    state.stickers = {}
    state.perms = 0
    state.viewing = 's1'
  })

  it('com "Adicionar figurinhas" mostra o envio', () => {
    state.perms = Perm.ADD_STICKERS
    const html = render()
    expect(html).toContain('Nova figurinha')
    expect(html).toContain('Adicionar a primeira')
  })

  it('sem "Adicionar figurinhas" esconde o envio', () => {
    state.perms = 0
    const html = render()
    expect(html).not.toContain('Nova figurinha')
    expect(html).not.toContain('Adicionar a primeira')
    expect(html).toContain('Nenhuma figurinha no servidor ainda.')
  })

  it('em outro servidor (sem os cargos dele) deixa o servidor decidir', () => {
    state.perms = 0
    state.viewing = 'outro'
    expect(render()).toContain('Nova figurinha')
    state.viewing = 's1'
  })

  describe('figurinhas de outros servidores', () => {
    beforeEach(() => {
      state.stickers = { s1: [sticker('a', 's1', 'festa')], s2: [sticker('b', 's2', 'gato')] }
    })

    it('uma seção por servidor, o atual primeiro, e o trilho', () => {
      const html = render({ serverId: 's2' })
      expect(html.indexOf('data-section-id="sticker:s2"')).toBeLessThan(html.indexOf('data-section-id="sticker:s1"'))
      expect(html.indexOf('aria-label="Beta"')).toBeLessThan(html.indexOf('aria-label="Alfa"'))
    })

    it('sem a permissão, as de fora ficam desabilitadas com o motivo', () => {
      const html = render()
      expect(html).toContain(REASON)
      expect(html).toMatch(/aria-label="gato" aria-disabled="true"/)
      expect(html).not.toMatch(/aria-label="festa" aria-disabled/)
    })

    it('com a permissão, todas podem', () => {
      state.perms = Perm.USE_EXTERNAL_EMOJIS
      const html = render()
      expect(html).not.toContain(REASON)
      expect(html).not.toContain('aria-disabled')
    })

    it('na DM aparecem todas, sem o envio nem o aviso de "só em servidores"', () => {
      const html = render({ serverId: null })
      expect(html).toContain('aria-label="festa"')
      expect(html).toContain('aria-label="gato"')
      expect(html).not.toContain('aria-disabled')
      expect(html).not.toContain('Nova figurinha')
    })

    it('a busca alcança todos os servidores', () => {
      const html = render({ search: 'GATO' })
      expect(html).toContain('aria-label="gato"')
      expect(html).not.toContain('aria-label="festa"')
    })

    it('busca sem resultado avisa', () => {
      expect(render({ search: 'zzz' })).toContain('Nenhuma figurinha encontrada.')
    })
  })
})
