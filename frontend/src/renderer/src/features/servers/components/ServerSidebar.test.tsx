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
const categoryState = vi.hoisted(() => ({ layout: null as import('../api/categories').CategoryLayout | null }))
vi.mock('../hooks/useCategories', () => ({ useCategories: () => ({ layout: categoryState.layout, run: vi.fn(), refresh: vi.fn(), saveLayout: vi.fn() }) }))
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
    categoryState.layout = null
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

  it('membro: nome do servidor, canais de texto e de voz, não lidas e o rodapé', () => {
    setup()
    const html = render()
    expect(html).toContain('title="Salinha"')
    expect(html).toContain('Canais de texto')
    expect(html).toContain('Canais de voz')
    expect(html).toContain('title="geral"')
    expect(html).toContain('resenha')
    expect(html).toContain('bg-fg/10 text-strong shadow-sm')
    expect(html).toContain('>2</span>')
    expect(html).toContain('Canal principal')
    expect(html).toContain('data-rodape')
    // Membro comum não cria nem arrasta canais; o "•••" do texto é de todos.
    expect(html).not.toContain('Criar canal de texto')
    expect(html).not.toContain('data-dnd="channel"')
    expect(html).toContain('aria-label="Opções do canal"')
    // Os três pontos são o ícone desenhado, não "•••" de texto.
    expect(html).not.toContain('•••')
    expect(html).toMatch(/aria-label="Opções do canal"[^>]*><svg/)
  })

  it('dono: cria nos dois tipos, arrasta e vê o canal privado com cadeado', () => {
    setup({ me: 'dono' })
    categoryState.layout = { categories: [], channels: [] }
    const html = render()
    expect(html).toContain('aria-label="Criar canal de texto"')
    expect(html).toContain('aria-label="Criar canal de voz"')
    expect(html).toContain('data-dnd="channel"')
    expect(html).toContain('(canal privado)')
  })

  it('criar categoria não troca as seções existentes por Sem categoria', () => {
    setup({ me: 'dono' })
    categoryState.layout = { categories: [{ id: 'jogos', name: 'Jogos', position: 0 }], channels: [] }
    const html = render()
    expect(html).toContain('Canais de texto')
    expect(html).toContain('Canais de voz')
    expect(html).toContain('title="geral"')
    expect(html).toContain('resenha')
    expect(html).toContain('Jogos')
    expect(html).not.toContain('>Sem categoria</p>')
    expect(html.match(/title="geral"/g)).toHaveLength(1)
  })

  it('apenas os canais vinculados saem das seções anteriores', () => {
    setup({ me: 'dono' })
    categoryState.layout = { categories: [{ id: 'jogos', name: 'Jogos', position: 0 }], channels: [{ channel_id: 'geral', category_id: 'jogos', position: 0 }] }
    const html = render()
    expect(html.indexOf('title="geral"')).toBeGreaterThan(html.indexOf('Opções da categoria Jogos'))
    expect(html.indexOf('title="segredo"')).toBeLessThan(html.indexOf('Opções da categoria Jogos'))
    expect(html.match(/title="geral"/g)).toHaveLength(1)
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
    expect(html).toContain('Nenhum canal de voz ainda.')
  })

  // O isolate do cabeçalho prende o z-30 do menu aberto: sem z-index próprio,
  // os canais logo abaixo pintam e recebem o clique por cima do menu.
  it('o cabeçalho fica acima da lista de canais (o menu do servidor abre por cima)', () => {
    setup()
    const header = /<div class="[^"]*\bisolate\b[^"]*"/.exec(render())?.[0] ?? ''
    expect(header).toMatch(/\bz-20\b/)
  })

  it('abrindo o servidor: nome em skeleton', () => {
    setup()
    useServerStore.setState({ currentServer: null })
    expect(render()).toContain('Carregando servidor…')
  })
})
