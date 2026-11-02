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
import { createFolderInLayout } from './ServerFolderModal'

let remoteServerLayout: RailLayoutItem[] = []

vi.mock('../api/serverLayout', () => ({
  getServerLayout: vi.fn(async () => remoteServerLayout),
  saveServerLayout: vi.fn(async (items: RailLayoutItem[]) => {
    remoteServerLayout = items
    return remoteServerLayout
  })
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
  state: { unreadByServer: { s2: 4 }, mentionsByServer: { s3: 2 } }
}))
vi.mock('../../chat/store/chatStore', () => ({
  useChatStore: Object.assign((sel: (s: unknown) => unknown) => sel(chat.state), {
    getState: () => chat.state
  })
}))

vi.mock('../../call/hooks/useServersVoiceActivity', () => ({
  useServersVoiceActivity: () => new Map([['s3', [{ id: 'u2', name: 'Bia' }]]])
}))

vi.mock('../../../shared/store/toastStore', () => ({
  showToast: { error: vi.fn() }
}))

vi.mock('../../../shared/ui/Modal', () => ({
  default: ({
    open,
    children,
    title
  }: {
    open: boolean
    children?: React.ReactNode
    title?: string
  }) =>
    open ? (
      <div role="dialog" aria-label={title}>
        {children}
      </div>
    ) : null
}))

vi.mock('../../auth/store/authStore', () => ({
  useAuthStore: { getState: () => ({ accessToken: 'tok-e2e' }) }
}))

vi.spyOn(React, 'useSyncExternalStore').mockImplementation((_subscribe, getSnapshot) =>
  getSnapshot()
)

const { useServerStore } = await import('../store/serverStore')
const { useServerLayoutStore } = await import('../store/serverLayoutStore')
const { useNotifySettingsStore } = await import('../../notifications/store/notifySettingsStore')
const { executeRailDrop, commitRailLayout } = await import('../hooks/useServerRailDrag')
const { default: ServerRailList } = await import('./ServerRailList')

const SERVERS: Server[] = [
  { id: 's1', name: 'Alpha', owner_id: 'u1', created_at: '', updated_at: '' },
  { id: 's2', name: 'Beta', owner_id: 'u1', created_at: '', updated_at: '' },
  { id: 's3', name: 'Gamma', owner_id: 'u1', created_at: '', updated_at: '' },
  { id: 's4', name: 'Delta', owner_id: 'u1', created_at: '', updated_at: '' }
]

function renderRail(path = '/servers/s1'): string {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[path]}>
      <ServerRailList />
    </MemoryRouter>
  )
}

beforeEach(() => {
  remoteServerLayout = []
  useServerLayoutStore.getState().reset()
  useNotifySettingsStore.getState().reset()
  useServerStore.setState({ servers: SERVERS, serversLoaded: true })
})

describe('Ordenação e pastas de servidores — fluxo E2E integrado', () => {
  it('reordena servidores, agrupa em pasta por drag-and-drop, renomeia, recolhe/expande, sincroniza via WS e desagrupa', async () => {
    await useServerLayoutStore.getState().fetchLayout()

    // 1. Ordem padrão inicial: Alpha, Beta, Gamma, Delta
    let html = renderRail()
    expect(html.indexOf('Alpha')).toBeLessThan(html.indexOf('Beta'))
    expect(html.indexOf('Beta')).toBeLessThan(html.indexOf('Gamma'))

    // 2. Arrasta Delta (s4) para o topo antes de Alpha (s1)
    const initialReconciled: RailLayoutItem[] = [
      { kind: 'server', server_id: 's1' },
      { kind: 'server', server_id: 's2' },
      { kind: 'server', server_id: 's3' },
      { kind: 'server', server_id: 's4' }
    ]
    executeRailDrop(
      initialReconciled,
      { kind: 'server', serverId: 's4', folderId: null },
      { scope: 'top', topIndex: 0, zone: 'before', targetId: 's1' }
    )
    await Promise.resolve()

    html = renderRail()
    expect(html.indexOf('Delta')).toBeLessThan(html.indexOf('Alpha'))

    // 3. Arrasta Gamma (s3) sobre Beta (s2) -> cria uma pasta expandida com Beta e Gamma e abre modal para renomear
    executeRailDrop(
      useServerLayoutStore.getState().items,
      { kind: 'server', serverId: 's3', folderId: null },
      { scope: 'top', topIndex: 2, zone: 'inside', targetId: 's2' }
    )
    await Promise.resolve()

    const folderItem = useServerLayoutStore
      .getState()
      .items.find((it): it is Extract<RailLayoutItem, { kind: 'folder' }> => it.kind === 'folder')
    expect(folderItem).toBeDefined()
    expect(folderItem?.server_ids).toEqual(['s2', 's3'])
    expect(useServerLayoutStore.getState().folderModal?.mode).toBe('rename')

    // 4. Renomeia a pasta para "Jogatina", fecha modal e reordena servidores dentro da pasta
    useServerLayoutStore.getState().closeFolderModal()
    const renamed = renameFolder(useServerLayoutStore.getState().items, folderItem!.id, 'Jogatina')
    const reorderedInside = moveFolderServer(renamed, folderItem!.id, 1, 0)
    await commitRailLayout(reorderedInside)

    html = renderRail()
    expect(html).toContain('aria-label="Jogatina"')
    expect(html).toContain('aria-expanded="true"')
    expect(html.indexOf('Gamma')).toBeLessThan(html.indexOf('Beta'))

    // 5. Recolhe a pasta: mostra grade 2x2 e agrega selo (4 + 2 = 6) e atividade de voz
    useServerLayoutStore.getState().toggleFolder(folderItem!.id)
    html = renderRail('/friends')
    expect(html).toContain('aria-label="Jogatina"')
    expect(html).toContain('aria-expanded="false"')
    expect(html).toContain('>6<')
    expect(html).toContain('aria-label="Chamada em andamento"')

    // 6. Cria segunda pasta pelo modal agrupando Delta e Alpha
    const withSecondFolder = createFolderInLayout(
      useServerLayoutStore.getState().items,
      'folder-work',
      'Trabalho',
      ['s4', 's1']
    )
    await commitRailLayout(withSecondFolder)
    html = renderRail()
    expect(html).toContain('aria-label="Trabalho"')

    // 7. Move pasta "Jogatina" para cima de "Trabalho" e remove s4 da pasta "Trabalho"
    const movedFolders = moveTopLevelItem(useServerLayoutStore.getState().items, 1, 0)
    const removedS4 = placeServerAtTopLevel(movedFolders, 's4', 0)
    await commitRailLayout(removedS4)
    expect(useServerLayoutStore.getState().items.map((i) => i.kind)).toEqual([
      'server',
      'folder',
      'folder'
    ])

    // 8. Recebe atualização em tempo real via WebSocket (server:layout) de outro dispositivo
    handleServerRoleEvent(
      {
        type: 'server:layout',
        payload: {
          items: [
            { kind: 'server', server_id: 's3' },
            { kind: 'folder', id: folderItem!.id, name: 'Jogatina Sync', server_ids: ['s2', 's1'] },
            { kind: 'server', server_id: 's4' }
          ]
        }
      },
      { onServerRemoved: vi.fn(), onPermissionsChanged: vi.fn() }
    )
    useServerLayoutStore.getState().setFolderCollapsed(folderItem!.id, false)
    html = renderRail()
    expect(html).toContain('aria-label="Jogatina Sync"')

    // 9. Desagrupa pasta voltando os servidores ao topo na posição original
    const ungrouped = ungroupFolder(useServerLayoutStore.getState().items, folderItem!.id)
    await commitRailLayout(ungrouped)
    expect(useServerLayoutStore.getState().items).toEqual([
      { kind: 'server', server_id: 's3' },
      { kind: 'server', server_id: 's2' },
      { kind: 'server', server_id: 's1' },
      { kind: 'server', server_id: 's4' }
    ])
  })
})
