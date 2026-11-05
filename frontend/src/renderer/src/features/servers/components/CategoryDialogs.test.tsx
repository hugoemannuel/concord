import { beforeEach, describe, expect, it, vi } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { CategoryDialogs } from './CategoryDialogs'
import { Perm } from '../lib/permissions'
import { useServerStore } from '../store/serverStore'
import type { CategoryDialog } from '../store/channelSidebarStore'

vi.mock('../../../shared/ui/Modal', () => ({ default: ({ title, children }: { title: string; children: React.ReactNode }) => <div><h2>{title}</h2>{children}</div> }))
vi.spyOn(React, 'useSyncExternalStore').mockImplementation((_subscribe, getSnapshot) => getSnapshot())

const jogos = { id: 'c', name: 'Jogos', position: 0 }
const render = (dialog: Exclude<CategoryDialog, { kind: 'permissions' }>, canManageRoles = true): string =>
  renderToStaticMarkup(<CategoryDialogs serverId="s" dialog={dialog} canManageRoles={canManageRoles} close={vi.fn()} run={async () => true} />)

describe('diálogos de categorias', () => {
  beforeEach(() => {
    useServerStore.setState({
      roles: [
        { id: 'everyone', name: '@everyone', is_default: true },
        { id: 'vip', name: 'VIP', is_default: false }
      ] as never,
      currentMembers: [{ user_id: 'ana', username: 'ana', display_name: 'Ana' }] as never
    })
  })

  it('criar: nome e a opção de privada', () => {
    const html = render({ kind: 'create' })
    expect(html).toContain('Criar categoria')
    expect(html).toContain('Nome da categoria')
    expect(html).toContain('Categoria privada')
    expect(html).toMatch(/aria-checked="false"/)
    // A lista de quem vê só aparece com a opção ligada.
    expect(html).not.toContain('VIP')
  })

  it('criar vale para quem só gerencia canais', () => {
    expect(render({ kind: 'create' }, false)).toContain('Categoria privada')
  })

  it('editar privada: vem marcada, com quem já pode ver', () => {
    const overwrites = [
      { target_type: 'role' as const, target_id: 'everyone', allow: 0, deny: Perm.VIEW_CHANNEL },
      { target_type: 'role' as const, target_id: 'vip', allow: Perm.VIEW_CHANNEL, deny: 0 },
      { target_type: 'member' as const, target_id: 'ana', allow: Perm.VIEW_CHANNEL, deny: 0 }
    ]
    const html = render({ kind: 'edit', category: { ...jogos, overwrites } })
    expect(html).toContain('Editar categoria')
    expect(html).toMatch(/aria-checked="true"/)
    expect(html).toContain('VIP')
    expect(html).toContain('Ana')
    expect(html).toContain('Buscar membro')
  })

  it('editar sem gerenciar cargos: só o nome', () => {
    const html = render({ kind: 'edit', category: jogos }, false)
    expect(html).toContain('Nome da categoria')
    expect(html).not.toContain('Categoria privada')
  })

  it('excluir confirma que os canais ficam soltos', () => {
    const html = render({ kind: 'delete', category: jogos })
    expect(html).toContain('Excluir categoria')
    expect(html).toContain('ficam soltos no topo da lista')
    expect(html).toContain('Nenhum canal é apagado')
    expect(html).not.toContain('Nome da categoria')
  })
})
