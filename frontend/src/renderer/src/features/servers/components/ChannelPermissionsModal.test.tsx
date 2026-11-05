import { beforeEach, describe, expect, it, vi } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

// Sem portal no SSR: o modal aberto vira um bloco com o título.
vi.mock('../../../shared/ui/Modal', () => ({
  default: ({ title, children }: { title?: string; children: React.ReactNode }) => (
    <div data-modal={title}>{children}</div>
  )
}))
const access = { perms: 0 }
vi.mock('../hooks/useServerAccess', () => ({
  useServerAccess: () => ({ isOwner: false, perms: access.perms, channelPerms: () => access.perms, can: () => true })
}))
const categories = vi.hoisted(() => ({ layout: null as unknown }))
vi.mock('../hooks/useCategories', () => ({ useCategories: () => ({ layout: categories.layout, refresh: vi.fn() }) }))
// SSR lê o estado atual do zustand.
vi.spyOn(React, 'useSyncExternalStore').mockImplementation((_subscribe, getSnapshot) =>
  getSnapshot()
)

import type { Channel } from '../api/channels'
import type { ServerMember } from '../api/servers'
import { Perm, type Role } from '../lib/permissions'
import { useServerStore } from '../store/serverStore'
import ChannelPermissionsModal, { CategorySyncNotice } from './ChannelPermissionsModal'

const role = (id: string, name: string, extra: Partial<Role> = {}): Role =>
  ({ id, server_id: 's1', name, color: null, position: 1, permissions: 0, hoist: false, is_default: false, ...extra }) as Role

const text = {
  id: 'c1',
  server_id: 's1',
  name: 'geral',
  type: 'text',
  overwrites: [{ target_type: 'role', target_id: 'everyone', allow: 0, deny: Perm.VIEW_CHANNEL }]
} as Channel

function setStore(channel: Channel): void {
  useServerStore.setState({
    currentServer: { id: 's1', name: 'Salinha', owner_id: 'dono' },
    roles: [role('everyone', '@everyone', { is_default: true, position: 0 }), role('mod', 'Mod')],
    currentMembers: [{ user_id: 'u1', username: 'ana' } as ServerMember],
    channels: [channel]
  })
}

const render = (channel: Channel | null = text): string =>
  renderToStaticMarkup(<ChannelPermissionsModal channel={channel} onClose={() => {}} />)

describe('ChannelPermissionsModal', () => {
  beforeEach(() => {
    access.perms = Perm.ADMINISTRATOR
    categories.layout = null
    setStore(text)
  })

  it('sem canal, nada', () => {
    expect(render(null)).toBe('')
  })

  it('canal de texto privado: título com #, interruptor ligado e o @everyone selecionado', () => {
    const html = render()
    expect(html).toContain('data-modal="Permissões de #geral"')
    expect(html).toMatch(/role="switch" aria-checked="true"/)
    expect(html).toMatch(/aria-current="true"[^>]*>.*@everyone/)
    expect(html).not.toContain('◆')
    expect(html).toContain('aria-label="Ver canais: Negar"')
  })

  it('negar, herdar e permitir são ícones (X, barra e check), não ✗ / ✓', () => {
    const html = render()
    expect(html).not.toMatch(/[✗✓]/)
    expect(html).toMatch(/aria-label="Ver canais: Negar"[^>]*><svg/)
    expect(html).toMatch(/aria-label="Ver canais: Herdar do servidor"[^>]*><svg/)
    expect(html).toMatch(/aria-label="Ver canais: Permitir"[^>]*><svg/)
  })

  it('cada permissão tem negar, herdar e permitir; o estado salvo vem marcado', () => {
    const html = render()
    expect(html).toMatch(/aria-label="Ver canais: Negar" aria-pressed="true"/)
    expect(html).toMatch(/aria-label="Ver canais: Permitir" aria-pressed="false"/)
  })

  it('canal de voz: título sem # e texto falando em entrar', () => {
    const voice = { ...text, id: 'v1', name: 'resenha', type: 'voice', overwrites: [] } as Channel
    setStore(voice)
    const html = render(voice)
    expect(html).toContain('data-modal="Permissões de resenha"')
    expect(html).toContain('ver e entrar neste canal')
  })

  it('sem a permissão no canal, os botões vêm travados', () => {
    access.perms = 0
    expect(render()).toMatch(/disabled="" aria-label="Ver canais: Negar"/)
  })

  it('em tela estreita a lista de cargos fica em cima, sem a coluna fixa espremendo as permissões', () => {
    const html = render()
    expect(html).toContain('flex flex-col gap-4 sm:flex-row')
    expect(html).toContain('w-full shrink-0 sm:w-52')
  })

  it('canal solto não fala de categoria', () => {
    expect(render()).not.toContain('Sincroniz')
  })

  it('canal vinculado diz que segue a categoria', () => {
    categories.layout = { categories: [{ id: 'cat', name: 'Jogos', position: 0 }], channels: [{ channel_id: 'c1', category_id: 'cat', position: 0, synced: true }] }
    const html = render()
    expect(html).toContain('Sincronizado com a categoria')
    expect(html).toContain('Jogos')
  })

  it('canal dessincronizado avisa e oferece sincronizar', () => {
    categories.layout = { categories: [{ id: 'cat', name: 'Jogos', position: 0 }], channels: [{ channel_id: 'c1', category_id: 'cat', position: 0, synced: false }] }
    const html = render()
    expect(html).toContain('permissões próprias')
    expect(html).toContain('Sincronizar')
  })
})

describe('CategorySyncNotice', () => {
  it('sem gerenciar cargos, só avisa', () => {
    const html = renderToStaticMarkup(<CategorySyncNotice categoryName="Jogos" synced={false} canSync={false} busy={false} onSync={vi.fn()} />)
    expect(html).toContain('permissões próprias')
    expect(html).not.toContain('<button')
  })
})
