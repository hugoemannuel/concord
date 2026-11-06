import { beforeEach, describe, expect, it, vi } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

// O chatStore de verdade puxa o resto do app; aqui só a presença.
const chat = vi.hoisted(() => ({ presence: {} as Record<string, unknown>, activity: '', listening: '' }))
vi.mock('../../chat/store/chatStore', () => ({
  useChatStore: (sel: (s: unknown) => unknown) => sel({ presence: chat.presence }),
  usePresenceStatus: (id: string) => (chat.presence[id] ? 'online' : 'offline')
}))
vi.mock('../../activity/store/presenceActivityStore', () => ({
  useActivity: (id: string) => (id === chat.activity ? { name: 'Jogo' } : null),
  useInVoice: () => false
}))
vi.mock('../../activity/store/listeningStore', () => ({
  useListening: (id: string) => (id === chat.listening ? { app: 'Spotify', title: 'x', started_at: 0 } : null)
}))
vi.mock('../../activity/components/ActivityLine', () => ({
  ActivityLine: ({ statusLabel }: { statusLabel: string }) => <i data-atividade={statusLabel} />
}))
vi.mock('../../profile/store/profileStore', () => ({
  useUserLook: (_id: string, fallback: { name: string }) => ({ name: fallback.name })
}))
vi.mock('../../profile/store/profileCardStore', () => ({ profileCardHandler: () => () => {} }))
vi.mock('../../profile/store/userMenuStore', () => ({ userMenuHandler: () => () => {} }))
vi.mock('../../profile/components/StyledName', () => ({
  default: ({ name }: { name: string }) => <b>{name}</b>
}))
vi.mock('../../../shared/ui/Avatar', () => ({
  default: ({ status, fallbackClassName }: { status: string; fallbackClassName: string }) => (
    <u data-status={status} data-cor={fallbackClassName} />
  )
}))
vi.mock('../../levels/components/LevelBadge', () => ({ default: () => <s data-nivel="" /> }))
vi.mock('../../levels/components/LevelRowShimmer', () => ({ default: () => null }))
vi.mock('../../levels/components/LevelUpBurst', () => ({ default: () => null }))
vi.mock('../../../shared/ui/ResizeHandle', () => ({ default: () => <hr data-alca="" /> }))
vi.mock('../../../shared/hooks/useResizableWidth', () => ({
  useResizableWidth: () => ({ width: 256, panelStyle: { width: 256 }, handleProps: {} })
}))

// SSR lê o estado atual do zustand (mesmo truque do ImageContextMenu.test).
vi.spyOn(React, 'useSyncExternalStore').mockImplementation((_subscribe, getSnapshot) =>
  getSnapshot()
)

import { useAuthStore } from '../../auth/store/authStore'
import { useServerStore } from '../store/serverStore'
import ServerMemberList from './ServerMemberList'

const server = { id: 's1', name: 'Salinha', owner_id: 'dono' } as never

function render(): string {
  return renderToStaticMarkup(<ServerMemberList server={server} />)
}

describe('ServerMemberList', () => {
  beforeEach(() => {
    // O servidor manda o Maestro sempre online, como qualquer pessoa conectada.
    chat.presence = { dono: true, ana: true, maestro: true }
    chat.activity = ''
    chat.listening = ''
    useAuthStore.setState({ user: { id: 'eu', username: 'eu', display_name: 'Eu' } as never })
    useServerStore.setState({
      roles: [
        { id: 'mod', name: 'Moderador', position: 2, permissions: 0, hoist: true, color: 0xff0000 }
      ] as never,
      currentMembers: [
        { user_id: 'dono', username: 'dono', display_name: 'Dona', role_ids: [] },
        { user_id: 'ana', username: 'ana', display_name: 'Ana', role_ids: ['mod'] },
        { user_id: 'bia', username: 'bia', role_ids: [], nickname: 'Bibi' },
        { user_id: 'maestro', username: 'maestro', display_name: 'Maestro', is_bot: true }
      ] as never
    })
  })

  it('agrupa como no Discord: cargo exibido, membros e offline (o dono não é grupo)', () => {
    const html = render()
    expect(html).not.toContain('Dono do Servidor')
    expect(html).toContain('Moderador — 1')
    expect(html).toContain('Membros — 2')
    expect(html).toContain('Offline — 1')
    expect(html).toContain('data-alca')
  })

  it('o dono tem a coroa ao lado do nome, sem cor própria', () => {
    const html = render()
    expect(html.match(/aria-label="Dono do servidor"/g)).toHaveLength(1)
    expect(html).toContain('title="Dono do servidor"')
    expect(html).not.toContain('bg-warning')
  })

  it('o cargo colorido pinta o nome e o offline fica cinza', () => {
    const html = render()
    expect(html).toContain('color:#ff0000')
    expect(html).toContain('data-cor="bg-[var(--interactive-muted)]"')
    expect(html).toContain('opacity-70')
  })

  it('o bot tem o status da presença (o servidor o manda online) e a etiqueta no lugar do nível', () => {
    const html = render()
    expect(html).toMatch(/data-status="online" data-cor="bg-brand"/)
    expect(html).not.toContain('Membros — 0')
  })

  it('o app não força o bot online: sem presença ele cai no offline', () => {
    chat.presence = { dono: true, ana: true }
    const html = render()
    expect(html).toContain('Membros — 1')
    expect(html).toContain('Offline — 2')
  })

  it('apelido ganha do nome; sem atividade mostra o @, com atividade a linha dela', () => {
    chat.activity = 'ana'
    const html = render()
    expect(html).toContain('title="Bibi"')
    expect(html).toContain('>@dono</p>')
    expect(html).toContain('data-atividade="@ana"')
  })

  it('quem só está ouvindo música também ganha a linha de atividade', () => {
    chat.listening = 'dono'
    const html = render()
    expect(html).toContain('data-atividade="@dono"')
    expect(html).not.toContain('>@dono</p>')
  })
})
