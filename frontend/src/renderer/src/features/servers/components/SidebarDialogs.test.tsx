import { beforeEach, describe, expect, it, vi } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'

// chatStore de verdade puxa o resto do app (e o áudio do LiveKit).
vi.mock('../../chat/store/chatStore', () => ({
  useChatStore: Object.assign((sel: (s: unknown) => unknown) => sel({}), { getState: () => ({}) })
}))
// O selo "Jogando" dos eventos lê a atividade de presença, que também puxa o callStore.
vi.mock('../../activity/store/presenceActivityStore', () => ({
  usePresenceActivityStore: (select: (s: { byUser: Record<string, never> }) => unknown) =>
    select({ byUser: {} })
}))
vi.mock('../../call/store/moderationStore', () => ({
  useModerationStore: Object.assign(() => null, { getState: () => ({ askNickname: vi.fn() }) })
}))
// Sem portal no SSR: o modal aberto vira um bloco com o título.
vi.mock('../../../shared/ui/Modal', () => ({
  default: ({
    open,
    title,
    children
  }: {
    open: boolean
    title?: string
    children: React.ReactNode
  }) => (open ? <div data-modal={title}>{children}</div> : null)
}))
vi.mock('./ChannelPermissionsModal', () => ({
  default: ({ channel }: { channel: { name: string } | null }) =>
    channel ? <div data-permissoes={channel.name} /> : null
}))

// SSR lê o estado atual do zustand (mesmo truque do ImageContextMenu.test).
vi.spyOn(React, 'useSyncExternalStore').mockImplementation((_subscribe, getSnapshot) =>
  getSnapshot()
)

import type { Channel } from '../api/channels'
import type { Server } from '../api/servers'
import type { ServerAccess } from '../lib/serverAccess'
import { Perm } from '../lib/permissions'
import { useAuthStore } from '../../auth/store/authStore'
import { useServerStore } from '../store/serverStore'
import { useChannelSidebarStore } from '../store/channelSidebarStore'
import SidebarDialogs from './SidebarDialogs'
import { PrivateRolesPicker } from './ChannelFormModal'
import ServerHeaderMenu, { ServerMenuItems } from './ServerHeaderMenu'
import { useServerLevelStore } from '../../serverlevel/store/serverLevelStore'

const server: Server = { id: 's1', name: 'Salinha', owner_id: 'dono' }
const voice = { id: 'v1', server_id: 's1', name: 'resenha', type: 'voice' } as Channel

function fakeAccess(perms: number, isOwner = false): ServerAccess {
  return {
    isOwner,
    perms,
    highest: 0,
    myRoles: [],
    can: (want) => (perms & want) === want,
    channelPerms: () => perms,
    canInChannel: (_id, want) => (perms & want) === want,
    highestOf: () => 0,
    canActOnMember: () => true,
    canEditRolesOf: () => true,
    canChangeNickname: () => true,
    canDisconnectMember: () => true,
    canMoveMember: () => true,
    canManage: () => false,
    isPrivate: () => false
  }
}

const render = (node: React.ReactNode): string =>
  renderToStaticMarkup(<MemoryRouter>{node}</MemoryRouter>)

describe('SidebarDialogs', () => {
  beforeEach(() => {
    useChannelSidebarStore.setState({
      menuFor: null,
      form: null,
      deleting: null,
      permissionsFor: null,
      confirm: null
    })
    useServerStore.setState({ roles: [] })
  })

  it('nada aberto: nada na tela', () => {
    expect(render(<SidebarDialogs server={server} />)).toBe('')
  })

  it('criar canal de voz: tipo, privado e o botão de criar', () => {
    useChannelSidebarStore.getState().openCreate('voice')
    const html = render(<SidebarDialogs server={server} />)
    expect(html).toContain('data-modal="Criar canal em Salinha"')
    expect(html).toContain('Tipo do canal')
    expect(html).toContain('veem e entram neste canal')
    expect(html).toContain('Criar canal')
  })

  it('criar canal de texto', () => {
    useChannelSidebarStore.getState().openCreate('text')
    expect(render(<SidebarDialogs server={server} />)).toContain(
      'Só os cargos escolhidos (e você) veem este canal.'
    )
  })

  it('editar: o nome já vem e não troca o tipo', () => {
    useChannelSidebarStore.getState().openEdit(voice)
    const html = render(<SidebarDialogs server={server} />)
    expect(html).toContain('data-modal="Editar canal em Salinha"')
    expect(html).toContain('value="resenha"')
    expect(html).not.toContain('Tipo do canal')
    expect(html).toContain('>Salvar<')
  })

  it('apagar canal, permissões e apagar servidor', () => {
    useChannelSidebarStore.setState({
      deleting: voice,
      permissionsFor: voice,
      confirm: 'delete-server'
    })
    const html = render(<SidebarDialogs server={server} />)
    expect(html).toContain('data-modal="Deletar canal"')
    expect(html).toContain('#resenha')
    expect(html).toContain('data-permissoes="resenha"')
    expect(html).toContain('data-modal="Deletar servidor"')
  })

  it('sair do servidor', () => {
    useChannelSidebarStore.setState({ confirm: 'leave' })
    const html = render(<SidebarDialogs server={server} />)
    expect(html).toContain('data-modal="Sair de Salinha"')
    expect(html).toContain('só volta com um novo convite')
  })
})

describe('PrivateRolesPicker', () => {
  const role = (id: string, is_default = false): never =>
    ({ id, name: id, is_default, position: 1, permissions: 0 }) as never

  it('sem cargos: só o dono e você', () => {
    expect(
      renderToStaticMarkup(
        <PrivateRolesPicker roles={[role('e', true)]} roleIds={[]} onChange={() => {}} />
      )
    ).toContain('Nenhum cargo ainda')
  })

  it('lista os cargos (menos o @everyone) com os marcados', () => {
    const html = renderToStaticMarkup(
      <PrivateRolesPicker
        roles={[role('e', true), role('vip'), role('mod')]}
        roleIds={['vip']}
        onChange={() => {}}
      />
    )
    expect(html).toContain('vip')
    expect(html).toContain('mod')
    expect(html.match(/checked=""/g)).toHaveLength(1)
  })
})

describe('ServerHeaderMenu', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: { id: 'ana', username: 'ana' } as never })
  })

  it('cabeçalho com o nome; sem servidor, skeleton', () => {
    const html = render(<ServerHeaderMenu server={server} access={fakeAccess(0)} />)
    expect(html).toContain('title="Salinha"')
    // A seta do menu é o chevron desenhado, não o ▼ de texto.
    expect(html).not.toContain('▼')
    expect(html).toContain('aria-expanded="false"')
    expect(html).toMatch(/<svg[^>]*aria-hidden="true"(?:(?!<\/svg>).)*<\/svg><\/button>/)
    expect(render(<ServerHeaderMenu server={null} access={fakeAccess(0)} />)).toContain(
      'Carregando servidor…'
    )
  })

  it('com o nível carregado: selo no cabeçalho e cartão no topo do menu', () => {
    useServerLevelStore.getState().apply({
      server_id: 's1',
      level: 4,
      xp: 4000,
      xp_into_level: 500,
      xp_for_next: 4000
    })
    expect(render(<ServerHeaderMenu server={server} access={fakeAccess(0)} />)).toContain('Nv. 4')
    const menu = render(
      <ServerMenuItems server={server} access={fakeAccess(0)} onPicked={() => {}} />
    )
    expect(menu).toContain('Nível 4')
    expect(menu.indexOf('Nível 4')).toBeLessThan(menu.indexOf('Sair do servidor'))
    useServerLevelStore.getState().reset()
  })

  it('membro: convidar, apelido, notificações e sair', () => {
    const html = render(
      <ServerMenuItems
        server={server}
        access={fakeAccess(Perm.CREATE_INVITE)}
        onPicked={() => {}}
      />
    )
    expect(html).toContain('Convidar pessoas')
    expect(html).toContain('Alterar apelido')
    expect(html).toContain('Notificações do servidor')
    expect(html).toContain('Sair do servidor')
    expect(html).not.toContain('Deletar servidor')
  })

  it('dono: configurações e deletar', () => {
    const html = render(
      <ServerMenuItems
        server={server}
        access={fakeAccess(Perm.MANAGE_SERVER, true)}
        onPicked={() => {}}
      />
    )
    expect(html).toContain('Configurações do servidor')
    expect(html).toContain('Deletar servidor')
    expect(html).not.toContain('Sair do servidor')
  })
})
