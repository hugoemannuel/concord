import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Server } from '../api/servers'
import {
  moveFolderServer,
  moveTopLevelItem,
  placeServerAtTopLevel,
  renameFolder,
  ungroupFolder,
  type RailLayoutItem
} from '../lib/serverRailLayout'
import { handleServerRoleEvent } from '../store/serverEvents'

const saveLayoutMock = vi.fn()
const getLayoutMock = vi.fn()

vi.mock('../api/serverLayout', () => ({
  getServerLayout: (...args: unknown[]) => getLayoutMock(...args),
  saveServerLayout: (...args: unknown[]) => saveLayoutMock(...args)
}))

vi.mock('../api/servers', () => ({
  listServers: vi.fn(async () => [])
}))

vi.mock('../api/invites', () => ({
  listInvites: vi.fn(async () => []),
  listServerInvites: vi.fn(async () => [])
}))

vi.mock('../api/channels', () => ({}))
vi.mock('../api/roles', () => ({}))

const call = vi.hoisted(() => ({ state: { serverCalls: {}, status: 'idle', type: null, channelId: null } }))
vi.mock('../../call/store/callStore', () => ({
  useCallStore: Object.assign((sel: (s: unknown) => unknown) => sel(call.state), {
    getState: () => call.state
  })
}))

const chat = vi.hoisted(() => ({
  state: { unreadByServer: { s1: 3 }, mentionsByServer: { s3: 1 } }
}))
vi.mock('../../chat/store/chatStore', () => ({
  useChatStore: Object.assign((sel: (s: unknown) => unknown) => sel(chat.state), {
    getState: () => chat.state
  })
}))

vi.mock('../../call/hooks/useServersVoiceActivity', () => ({
  useServersVoiceActivity: () => new Map([['s3', [{ id: 'u2', name: 'Bia' }]]])
}))

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

vi.mock('../../auth/store/authStore', () => {
  const state = { accessToken: 'tok-1', user: { id: 'u1', username: 'ana' } }
  return {
    useAuthStore: Object.assign((sel: (s: unknown) => unknown) => sel(state), {
      getState: () => state
    })
  }
})

vi.spyOn(React, 'useSyncExternalStore').mockImplementation((_subscribe, getSnapshot) =>
  getSnapshot()
)

const { useServerStore } = await import('../store/serverStore')
const { useServerLayoutStore } = await import('../store/serverLayoutStore')
const { useNotifySettingsStore } = await import('../../notifications/store/notifySettingsStore')
const { commitRailLayout, executeRailDrop } = await import('../hooks/useServerRailDrag')
const { default: ServerRailList } = await import('./ServerRailList')
const { createFolderInLayout, default: ServerFolderModal } = await import('./ServerFolderModal')
const { FolderMenuBody } = await import('./ServerRailContextMenu')
const { ServerMenuBody } = await import('./ServerRailMenu')

const SERVERS: Server[] = [
  { id: 's1', name: 'Servidor Alpha', owner_id: 'u1', created_at: '', updated_at: '' },
  { id: 's2', name: 'Servidor Beta', owner_id: 'u1', created_at: '', updated_at: '' },
  { id: 's3', name: 'Servidor Gamma', owner_id: 'u1', created_at: '', updated_at: '' }
]

function renderRail(path = '/servers/s1'): string {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[path]}>
      <ServerRailList />
    </MemoryRouter>
  )
}

beforeEach(() => {
  saveLayoutMock.mockReset()
  getLayoutMock.mockReset()
  saveLayoutMock.mockImplementation(async (items: RailLayoutItem[]) => items)
  useServerStore.setState({ servers: SERVERS, serversLoaded: true })
  useServerLayoutStore.getState().reset()
  useNotifySettingsStore.getState().reset()
})

describe('ServerRailList — E2E integrado (ordenação, pastas, menu e modal)', () => {
  it('renderiza servidores na ordem personalizada e agrupa em pastas expandidas ou recolhidas', () => {
    useServerLayoutStore.setState({
      items: [
        { kind: 'folder', id: 'f1', name: 'Meus Favoritos', server_ids: ['s3', 's1'] },
        { kind: 'server', server_id: 's2' }
      ],
      loaded: true
    })

    // Expandida: mostra o botão da pasta e os servidores dentro na ordem definida (Gamma antes de Alpha)
    const expandedHtml = renderRail('/servers/s1')
    expect(expandedHtml).toContain('aria-label="Meus Favoritos"')
    expect(expandedHtml).toContain('aria-expanded="true"')
    expect(expandedHtml.indexOf('Servidor Gamma')).toBeLessThan(
      expandedHtml.indexOf('Servidor Alpha')
    )
    expect(expandedHtml.indexOf('Servidor Alpha')).toBeLessThan(
      expandedHtml.indexOf('Servidor Beta')
    )

    // Recolhida: soma os selos (1 menção em s3 + 3 não lidas em s1 = 4) e mostra voz ativa
    useServerLayoutStore.getState().toggleFolder('f1')
    const collapsedHtml = renderRail('/friends')
    expect(collapsedHtml).toContain('aria-label="Meus Favoritos"')
    expect(collapsedHtml).toContain('aria-expanded="false"')
    expect(collapsedHtml).toContain('>4<')
    expect(collapsedHtml).toContain('aria-label="Chamada em andamento"')
    expect(collapsedHtml).not.toContain('aria-label="Servidor Gamma"')
    expect(collapsedHtml).toContain('aria-label="Servidor Beta"')
  })

  it('renderiza menu de contexto de servidor (avulso e em pasta) e de pasta', () => {
    const items: RailLayoutItem[] = [
      { kind: 'folder', id: 'f1', name: 'Jogos', server_ids: ['s1', 's2'] },
      { kind: 'server', server_id: 's3' }
    ]

    // Menu do ícone: as escolhas de mover moram no submenu "Mover para…" (lib/railMoveMenu.test)
    const s3Menu = renderToStaticMarkup(
      <MemoryRouter>
        <ServerMenuBody serverId="s3" items={items} onClose={() => {}} />
      </MemoryRouter>
    )
    expect(s3Menu).toContain('Marcar como lido')
    expect(s3Menu).toContain('Silenciar servidor')
    expect(s3Menu).toContain('Notificações do servidor')
    expect(s3Menu).toContain('Mover para…')
    // Dono (u1): apaga em vez de sair. Sem permissões lidas ainda, nada de criar canal.
    expect(s3Menu).toContain('Deletar servidor')
    expect(s3Menu).not.toContain('Sair do servidor')
    expect(s3Menu).not.toContain('Criar canal')

    // Servidor de outra pessoa: sai em vez de apagar
    useServerStore.setState({ servers: [{ ...SERVERS[2], owner_id: 'outra-pessoa' }] })
    const otherMenu = renderToStaticMarkup(
      <MemoryRouter>
        <ServerMenuBody serverId="s3" items={items} onClose={() => {}} />
      </MemoryRouter>
    )
    expect(otherMenu).toContain('Sair do servidor')
    expect(otherMenu).not.toContain('Deletar servidor')
    expect(otherMenu).not.toContain('Configurações do servidor')

    // Menu da pasta Jogos permite editar o nome, descer e desfazer pasta
    const folderMenu = renderToStaticMarkup(
      <FolderMenuBody
        target={{ kind: 'folder', folderId: 'f1', name: 'Jogos', x: 0, y: 0 }}
        items={items}
        onClose={() => {}}
      />
    )
    expect(folderMenu).toContain('Editar pasta')
    expect(folderMenu).toContain('Mover para baixo')
    expect(folderMenu).toContain('Desfazer pasta')
  })

  it('createFolderInLayout e ServerFolderModal criam e editam pastas', () => {
    const base: RailLayoutItem[] = [
      { kind: 'server', server_id: 's1' },
      { kind: 'server', server_id: 's2' },
      { kind: 'server', server_id: 's3' }
    ]
    const next = createFolderInLayout(base, 'f-new', 'Squad', ['s1', 's3'])
    expect(next).toEqual([
      { kind: 'folder', id: 'f-new', name: 'Squad', server_ids: ['s1', 's3'] },
      { kind: 'server', server_id: 's2' }
    ])

    useServerLayoutStore.getState().openFolderModal({
      mode: 'create',
      initialServerIds: ['s1']
    })
    const createModalHtml = renderToStaticMarkup(
      <ServerFolderModal servers={SERVERS} reconciledItems={base} />
    )
    expect(createModalHtml).toContain('data-modal="Criar pasta de servidores"')
    expect(createModalHtml).toContain('Nome da pasta')
    expect(createModalHtml).toContain('Servidor Alpha')

    useServerLayoutStore.getState().openFolderModal({
      mode: 'rename',
      folderId: 'f-new',
      initialName: 'Squad'
    })
    const renameModalHtml = renderToStaticMarkup(
      <ServerFolderModal servers={SERVERS} reconciledItems={next} />
    )
    expect(renameModalHtml).toContain('data-modal="Editar pasta de servidores"')
  })

  it('fluxo ponta a ponta: arrasta servidores, agrupa em pasta, renomeia, recolhe/expande, sincroniza por WS e desagrupa', async () => {
    getLayoutMock.mockResolvedValueOnce([])
    await useServerLayoutStore.getState().fetchLayout()

    const initial: RailLayoutItem[] = [
      { kind: 'server', server_id: 's1' },
      { kind: 'server', server_id: 's2' },
      { kind: 'server', server_id: 's3' }
    ]

    // 1. Arrasta Gamma (s3) para o topo antes de Alpha (s1)
    executeRailDrop(
      initial,
      { kind: 'server', serverId: 's3', folderId: null },
      { scope: 'top', topIndex: 0, zone: 'before', targetId: 's1' }
    )
    await Promise.resolve()
    let html = renderRail('/servers/s1')
    expect(html.indexOf('Servidor Gamma')).toBeLessThan(html.indexOf('Servidor Alpha'))

    // 2. Arrasta Beta (s2) sobre Alpha (s1) -> cria uma pasta expandida com Alpha e Beta
    executeRailDrop(
      useServerLayoutStore.getState().items,
      { kind: 'server', serverId: 's2', folderId: null },
      { scope: 'top', topIndex: 1, zone: 'inside', targetId: 's1' }
    )
    await Promise.resolve()
    const folder = useServerLayoutStore
      .getState()
      .items.find((it): it is Extract<RailLayoutItem, { kind: 'folder' }> => it.kind === 'folder')
    expect(folder?.server_ids).toEqual(['s1', 's2'])

    // 3. Renomeia a pasta para "Jogatina", inverte a ordem interna e move a pasta para o topo
    const renamed = renameFolder(useServerLayoutStore.getState().items, folder!.id, 'Jogatina')
    const reordered = moveFolderServer(renamed, folder!.id, 1, 0)
    const movedTop = moveTopLevelItem(reordered, 1, 0)
    await commitRailLayout(movedTop)

    html = renderRail('/servers/s1')
    expect(html).toContain('aria-label="Jogatina"')
    expect(html.indexOf('Servidor Beta')).toBeLessThan(html.indexOf('Servidor Alpha'))
    expect(html.indexOf('Servidor Alpha')).toBeLessThan(html.indexOf('Servidor Gamma'))

    // 4. Sincroniza mudança via WebSocket (server:layout) e depois desagrupa
    handleServerRoleEvent(
      {
        type: 'server:layout',
        payload: {
          items: [
            { kind: 'folder', id: folder!.id, name: 'Jogatina WS', server_ids: ['s2', 's3'] },
            { kind: 'server', server_id: 's1' }
          ]
        }
      },
      { onServerRemoved: vi.fn(), onPermissionsChanged: vi.fn() }
    )
    expect(renderRail('/servers/s1')).toContain('aria-label="Jogatina WS"')

    const removedS2 = placeServerAtTopLevel(useServerLayoutStore.getState().items, 's2', 0)
    const ungrouped = ungroupFolder(removedS2, folder!.id)
    await commitRailLayout(ungrouped)
    expect(useServerLayoutStore.getState().items).toEqual([
      { kind: 'server', server_id: 's2' },
      { kind: 'server', server_id: 's3' },
      { kind: 'server', server_id: 's1' }
    ])
  })
})
