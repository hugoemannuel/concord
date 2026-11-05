import { beforeEach, describe, expect, it, vi } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import type { Channel } from '../api/channels'
import { useNotifySettingsStore } from '../../notifications/store/notifySettingsStore'
import { useHideMutedStore } from '../store/hideMutedStore'
import { useChannelSidebarStore } from '../store/channelSidebarStore'
import { CategoryPanel } from './CategoryPanel'

const chat = vi.hoisted(() => ({ state: { unreadByRoom: {}, mentionsByRoom: {} } as Record<string, unknown> }))
vi.mock('../../chat/store/chatStore', () => ({
  useChatStore: Object.assign((sel: (s: unknown) => unknown) => sel(chat.state), { getState: () => chat.state })
}))
vi.mock('../hooks/useCollapsedCategories', () => ({ useCollapsedCategories: () => [[], vi.fn()] }))
vi.mock('../../../shared/ui/Modal', () => ({ default: ({ title, children }: { title: string; children: React.ReactNode }) => <div><h2>{title}</h2>{children}</div> }))
vi.spyOn(React, 'useSyncExternalStore').mockImplementation((_subscribe, getSnapshot) => getSnapshot())

const channels = [
  { id: 'a', name: 'geral', type: 'text' },
  { id: 'b', name: 'voz', type: 'voice' },
  { id: 'c', name: 'livre', type: 'text' },
  { id: 'd', name: 'sala', type: 'voice' }
] as Channel[]
const layout = {
  categories: [{ id: 'cat', name: 'Jogos', position: 0 }],
  channels: [
    { channel_id: 'd', category_id: null, position: 0 },
    { channel_id: 'c', category_id: null, position: 1 },
    { channel_id: 'a', category_id: 'cat', position: 0, synced: true },
    { channel_id: 'b', category_id: 'cat', position: 1, synced: false }
  ]
}

type PanelProps = Partial<React.ComponentProps<typeof CategoryPanel>>
const render = (props: PanelProps = {}): string => renderToStaticMarkup(
  <MemoryRouter>
    <CategoryPanel serverId="s" userId="u" layout={layout} channels={channels} ready canManage canManageRoles
      run={async () => true} saveLayout={vi.fn()} onCreateChannel={vi.fn()}
      renderChannel={(channel, _group, controls) => <div>{channel.name}{controls}</div>} {...props} />
  </MemoryRouter>
)

describe('CategoryPanel', () => {
  beforeEach(() => {
    useHideMutedStore.setState({ byKey: {} })
    useChannelSidebarStore.setState({ categoryDialog: null })
    useNotifySettingsStore.setState({ channels: {} })
  })

  it('canais soltos no topo, texto e voz misturados na ordem da lista', () => {
    const html = render()
    expect(html.indexOf('sala')).toBeLessThan(html.indexOf('livre'))
    expect(html.indexOf('livre')).toBeLessThan(html.indexOf('Opções da categoria Jogos'))
    expect(html.indexOf('Opções da categoria Jogos')).toBeLessThan(html.indexOf('geral'))
    expect(html).not.toContain('Canais de texto')
    expect(html).not.toContain('Canais de voz')
  })
  it('quem gerencia canais pode arrastar; quem não gerencia, não', () => {
    expect(render()).toContain('data-dnd="channel"')
    expect(render()).toContain('data-dnd="category-header"')
    expect(render()).toContain('data-dnd="category-block"')
    expect(render()).toContain('data-dnd="loose"')
    expect(render({ canManage: false })).not.toContain('data-dnd')
  })
  it('sem categorias a lista funciona, sem oferecer mover para categoria', () => {
    const html = render({ layout: { categories: [], channels: [] } })
    expect(html).toContain('geral')
    expect(html).not.toContain('Mover geral para categoria')
    expect(html).toContain('data-dnd="channel"')
  })
  it('com categorias, o menu do canal oferece mover', () => {
    expect(render()).toContain('Mover geral para categoria')
  })
  it('linhas e cabeçalhos ficam fora do menu da área vazia', () => {
    const html = render({ canManage: false })
    expect(html.match(/data-sidebar-item/g)?.length).toBe(5)
  })
  it('canal dessincronizado: aviso e, para quem pode, sincronizar', () => {
    const html = render()
    expect(html).toContain('role="img" aria-label="Permissões próprias: este canal não segue a categoria"')
    expect(html).toContain('Sincronizar com a categoria')
    expect(render({ canManageRoles: false })).not.toContain('Sincronizar com a categoria')
    expect(render({ canManage: false })).not.toContain('Permissões próprias')
  })
  it('sem nada para mostrar', () => {
    expect(render({ channels: [], layout: { categories: [], channels: [] } })).toContain('Nenhum canal ainda.')
  })
  it('ainda carregando: esqueleto, sem dizer que está vazio', () => {
    const html = render({ ready: false, channels: [], layout: null })
    expect(html).not.toContain('Nenhum canal ainda.')
  })
  it('ocultar silenciados some com o canal silenciado sem nada novo', () => {
    useNotifySettingsStore.setState({ channels: { c: { muted: true, muted_until: null, level: 'all', suppress_everyone: false } } })
    expect(render()).toContain('livre')
    useHideMutedStore.getState().toggle('u', 's')
    const html = render()
    expect(html).not.toContain('livre')
    expect(html).toContain('sala')
  })
  it('abre os diálogos pedidos no menu do servidor ou da área vazia', () => {
    useChannelSidebarStore.setState({ categoryDialog: { kind: 'create' } })
    expect(render()).toContain('Criar categoria')
  })
})
