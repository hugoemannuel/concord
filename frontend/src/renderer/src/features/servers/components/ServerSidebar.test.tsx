import { beforeEach, describe, expect, it, vi } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

// callStore e chatStore de verdade puxam o resto do app (e o áudio do LiveKit).
const call = vi.hoisted(() => ({ state: {} as Record<string, unknown> }))
vi.mock('../../call/store/callStore', () => ({
  useCallStore: Object.assign((sel: (s: unknown) => unknown) => sel(call.state), {
    getState: () => call.state
  })
}))
const chat = vi.hoisted(() => ({ state: {} as Record<string, unknown> }))
const categoryState = vi.hoisted(() => ({ layout: null as import('../api/categories').CategoryLayout | null, failed: false }))
vi.mock('../hooks/useCategories', () => ({ useCategories: () => ({ layout: categoryState.layout, failed: categoryState.failed, run: vi.fn(), refresh: vi.fn(), saveLayout: vi.fn() }) }))
vi.mock('../../chat/store/chatStore', () => ({
  useChatStore: Object.assign((sel: (s: unknown) => unknown) => sel(chat.state), {
    getState: () => chat.state
  })
}))
vi.mock('../../call/components/CallActivityBadge', () => ({ default: () => null }))
vi.mock('../../activity/components/ActivityLine', () => ({ GameBadge: () => null }))
// O "Assistir" da prévia do selo LIVE abre a chamada pelo router (o app inteiro).
vi.mock('../../call/store/streamJoinStore', () => ({ requestWatchStream: vi.fn() }))
vi.mock('../../../app/SidebarFooter', () => ({ default: () => <footer data-rodape="" /> }))
vi.mock('./ChannelPermissionsModal', () => ({ default: () => null }))

// SSR lê o estado atual do zustand (mesmo truque do ImageContextMenu.test).
vi.spyOn(React, 'useSyncExternalStore').mockImplementation((_subscribe, getSnapshot) =>
  getSnapshot()
)

import type { Channel } from '../api/channels'
import { useAuthStore } from '../../auth/store/authStore'
import { useServerStore } from '../store/serverStore'
import { useChannelSidebarStore } from '../store/channelSidebarStore'
import { DEFAULT_EVERYONE, Perm } from '../lib/permissions'
import { ServerSidebar } from './ServerSidebar'

const channel = (id: string, type: 'text' | 'voice', extra: Partial<Channel> = {}): Channel => ({
  id,
  server_id: 's1',
  name: id,
  type,
  created_by: 'dono',
  created_at: `2026-01-0${id.length}T00:00:00Z`,
  updated_at: '',
  ...extra
})

function setup({ me = 'ana', ready = true } = {}): void {
  useAuthStore.setState({ user: { id: me, username: me, display_name: me } as never })
  useServerStore.setState({
    currentServer: { id: 's1', name: 'Salinha', owner_id: 'dono' },
    currentMembers: [
      { user_id: 'dono', role_ids: [] },
      { user_id: 'ana', role_ids: [] }
    ] as never,
    roles: [
      {
        id: 'everyone',
        server_id: 's1',
        name: '@everyone',
        color: null,
        position: 0,
        permissions: DEFAULT_EVERYONE,
        hoist: false,
        is_default: true
      }
    ],
    channels: [
      channel('geral', 'text'),
      channel('segredo', 'text', {
        overwrites: [
          { target_type: 'role', target_id: 'everyone', allow: 0, deny: Perm.VIEW_CHANNEL }
        ]
      } as Partial<Channel>),
      channel('resenha', 'voice')
    ],
    channelsLoadedFor: ready ? 's1' : null
  })
}

function render(path = '/servers/s1/channels/geral'): string {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/servers/:id/channels/:channelId" element={<ServerSidebar />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('ServerSidebar', () => {
  beforeEach(() => {
    categoryState.layout = { categories: [], channels: [] }
    categoryState.failed = false
    call.state = {
      serverCalls: {},
      status: 'idle',
      type: null,
      channelId: null,
      knock: null,
      speakingIds: [],
      screenSharers: [],
      listVersion: 0,
      admittedChannelId: null,
      clearAdmittedChannel: () => {},
      joinVoiceChannel: () => Promise.resolve(),
      cancelJoinRequest: () => {},
      muted: false,
      deafened: false
    }
    chat.state = { unreadByRoom: { 'channel:geral': 2 }, mentionsByRoom: {} }
    useChannelSidebarStore.setState({
      menuFor: null,
      form: null,
      deleting: null,
      permissionsFor: null,
      confirm: null
    })
  })

  it('membro: nome do servidor, canais soltos, não lidas e o rodapé', () => {
    setup()
    const html = render()
    expect(html).toContain('title="Salinha"')
    expect(html).toContain('title="geral"')
    expect(html).toContain('resenha')
    expect(html).toContain('bg-fg/10 text-strong shadow-sm')
    expect(html).toContain('>2</span>')
    expect(html).toContain('Canal principal')
    expect(html).toContain('data-rodape')
    // As seções por tipo não existem mais.
    expect(html).not.toContain('Canais de texto')
    expect(html).not.toContain('Canais de voz')
    // Membro comum não arrasta canais; o "•••" do texto é de todos.
    expect(html).not.toContain('data-dnd="channel"')
    expect(html).toContain('aria-label="Opções do canal"')
    // Os três pontos são o ícone desenhado, não "•••" de texto.
    expect(html).not.toContain('•••')
    expect(html).toMatch(/aria-label="Opções do canal"[^>]*><svg/)
  })

  it('dono: arrasta e vê o canal privado com cadeado', () => {
    setup({ me: 'dono' })
    const html = render()
    expect(html).toContain('data-dnd="channel"')
    expect(html).toContain('(canal privado)')
  })

  it('"Canais de texto" agora é uma categoria como outra qualquer', () => {
    setup({ me: 'dono' })
    categoryState.layout = {
      categories: [{ id: 'texto', name: 'Canais de texto', position: 0 }],
      channels: [{ channel_id: 'geral', category_id: 'texto', position: 0, synced: true }]
    }
    const html = render()
    expect(html).toContain('Opções da categoria Canais de texto')
    expect(html).toContain('Criar canal em Canais de texto')
    expect(html.match(/title="geral"/g)).toHaveLength(1)
  })

  it('só os canais de uma categoria saem da lista solta', () => {
    setup({ me: 'dono' })
    categoryState.layout = { categories: [{ id: 'jogos', name: 'Jogos', position: 0 }], channels: [{ channel_id: 'geral', category_id: 'jogos', position: 0 }] }
    const html = render()
    expect(html.indexOf('title="geral"')).toBeGreaterThan(html.indexOf('Opções da categoria Jogos'))
    expect(html.indexOf('title="segredo"')).toBeLessThan(html.indexOf('Opções da categoria Jogos'))
    expect(html.match(/title="geral"/g)).toHaveLength(1)
  })

  it('organização ainda não chegou: esqueleto, para a lista não pular', () => {
    setup()
    categoryState.layout = null
    expect(render()).not.toContain('title="geral"')
  })

  it('organização falhou: os canais aparecem mesmo assim', () => {
    setup()
    categoryState.layout = null
    categoryState.failed = true
    expect(render()).toContain('title="geral"')
  })

  it('menu do canal aberto: itens de quem gerencia', () => {
    setup({ me: 'dono' })
    useChannelSidebarStore.setState({ menuFor: 'geral' })
    const html = render()
    expect(html).toContain('Notificações do canal')
    expect(html).toContain('Mover para baixo')
    expect(html).toContain('Editar canal')
    expect(html).toContain('Deletar canal')
    expect(html).not.toContain('Definir como principal')
  })

  it('menu do canal de voz (dono)', () => {
    setup({ me: 'dono' })
    useChannelSidebarStore.setState({ menuFor: 'resenha' })
    const html = render()
    expect(html).toContain('Permissões')
    expect(html).not.toContain('Notificações do canal')
  })

  it('lista ainda do servidor anterior: skeleton', () => {
    setup({ ready: false })
    useServerStore.setState({ channels: [] })
    const html = render()
    expect(html).not.toContain('Nenhum canal ainda.')
    expect(html).not.toContain('title="geral"')
  })

  it('servidor sem canais', () => {
    setup()
    useServerStore.setState({ channels: [] })
    const html = render()
    expect(html).toContain('Nenhum canal ainda.')
  })

  it('abrindo o servidor: nome em skeleton', () => {
    setup()
    useServerStore.setState({ currentServer: null })
    expect(render()).toContain('Carregando servidor…')
  })
})
