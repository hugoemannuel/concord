import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Server } from '../api/servers'
import { Perm } from '../lib/permissions'

vi.mock('../api/servers', () => ({ listServers: vi.fn(async () => []), getServer: vi.fn() }))
vi.mock('../api/invites', () => ({ listInvites: vi.fn(async () => []), listServerInvites: vi.fn(async () => []) }))
vi.mock('../api/channels', () => ({ listChannels: vi.fn() }))
vi.mock('../api/roles', () => ({}))
vi.mock('../api/serverLayout', () => ({ getServerLayout: vi.fn(), saveServerLayout: vi.fn() }))
vi.mock('../../call/store/callStore', () => ({ useCallStore: { getState: () => ({}) } }))
vi.mock('../../call/store/moderationStore', () => ({
  useModerationStore: Object.assign(() => null, { getState: () => ({ askNickname: vi.fn() }) })
}))
vi.mock('../../chat/store/chatStore', () => ({
  useChatStore: Object.assign((sel: (s: unknown) => unknown) => sel({}), { getState: () => ({}) })
}))
vi.mock('../../auth/store/authStore', () => {
  const state = { accessToken: 'tok', user: { id: 'eu', username: 'eu' } }
  return {
    useAuthStore: Object.assign((sel: (s: unknown) => unknown) => sel(state), { getState: () => state })
  }
})
vi.spyOn(React, 'useSyncExternalStore').mockImplementation((_subscribe, getSnapshot) => getSnapshot())

const { useServerStore } = await import('../store/serverStore')
const { ServerMenuBody } = await import('./ServerRailMenu')

const everyone = {
  id: 'r0', server_id: 'aberto', name: '@everyone', color: null, hoist: false, position: 0,
  is_default: true, permissions: Perm.CREATE_INVITE | Perm.CHANGE_NICKNAME
}
const aberto: Server = { id: 'aberto', name: 'Aberto', owner_id: 'outro' }
const clicado: Server = { id: 'clicado', name: 'Clicado', owner_id: 'outro' }

function render(serverId: string): string {
  return renderToStaticMarkup(
    <MemoryRouter>
      <ServerMenuBody serverId={serverId} items={[]} onClose={() => {}} />
    </MemoryRouter>
  )
}

function openServer(permissions: number, owner = 'outro'): void {
  useServerStore.setState({
    servers: [{ ...aberto, owner_id: owner }, clicado],
    currentServer: { ...aberto, owner_id: owner },
    currentMembers: [{ server_id: 'aberto', user_id: 'eu', role: 'member' }],
    roles: [{ ...everyone, permissions }],
    channels: []
  })
}

beforeEach(() => {
  useServerStore.setState({ servers: [], currentServer: null, currentMembers: [], roles: [], channels: [] })
})

describe('menu do ícone: itens por permissão (servidor aberto)', () => {
  it('membro comum: convida, muda apelido, abre as configurações (aba Plugins) e sai; sem criar canal', () => {
    openServer(everyone.permissions)
    const html = render('aberto')
    for (const label of [
      'Marcar como lido', 'Convidar pessoas', 'Silenciar servidor', 'Notificações do servidor',
      'Nível do servidor', 'Perfil do servidor', 'Alterar apelido', 'Editar perfil do servidor',
      'Eventos', 'Mover para…', 'Sair do servidor', 'Configurações do servidor'
    ]) {
      expect(html).toContain(label)
    }
    for (const label of ['Criar canal', 'Criar categoria', 'Deletar servidor']) {
      expect(html).not.toContain(label)
    }
  })

  it('Gerenciar canais mostra criar canal e criar categoria', () => {
    openServer(everyone.permissions | Perm.MANAGE_CHANNELS)
    const html = render('aberto')
    expect(html).toContain('Criar canal')
    expect(html).toContain('Criar categoria')
  })

  it('Gerenciar servidor mostra as configurações', () => {
    openServer(everyone.permissions | Perm.MANAGE_SERVER)
    expect(render('aberto')).toContain('Configurações do servidor')
  })

  it('sem Convidar nem apelido, os dois itens somem', () => {
    openServer(0)
    const html = render('aberto')
    expect(html).not.toContain('Convidar pessoas')
    expect(html).not.toContain('Alterar apelido')
  })

  it('dono apaga em vez de sair e tem tudo', () => {
    openServer(0, 'eu')
    const html = render('aberto')
    expect(html).toContain('Deletar servidor')
    expect(html).not.toContain('Sair do servidor')
    expect(html).toContain('Configurações do servidor')
  })
})

describe('menu do ícone: servidor clicado diferente do aberto', () => {
  it('não usa as permissões do aberto: até chegar a leitura, só o que todo membro tem', () => {
    // No aberto a pessoa gerencia canais; no clicado ainda não se sabe nada.
    openServer(everyone.permissions | Perm.MANAGE_CHANNELS | Perm.MANAGE_SERVER)
    const html = render('clicado')
    expect(html).toContain('Marcar como lido')
    expect(html).toContain('Sair do servidor')
    expect(html).not.toContain('Criar canal')
    // Configurações abrem para todo membro (aba Plugins, PR #514).
    expect(html).toContain('Configurações do servidor')
    expect(html).not.toContain('Convidar pessoas')
  })
})
