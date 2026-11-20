import { describe, expect, it, vi } from 'vitest'

const role = (over: Record<string, unknown>): Record<string, unknown> => ({
  id: 'r',
  name: 'Cargo',
  color: null,
  hoist: false,
  permissions: 0,
  position: 1,
  is_default: false,
  is_system: false,
  ...over
})
const state = vi.hoisted(() => ({ roles: [] as unknown[] }))
vi.mock('../store/serverStore', () => ({
  useServerStore: (select: (s: unknown) => unknown) =>
    select({
      currentServer: { id: 's1' },
      roles: state.roles,
      currentMembers: [],
      createRole: vi.fn(),
      reorderRoles: vi.fn(),
      updateRole: vi.fn(),
      deleteRole: vi.fn()
    })
}))
vi.mock('../hooks/useServerAccess', () => ({
  useServerAccess: () => ({ canManage: () => true, can: () => true, perms: 0 })
}))
vi.mock('./PermissionSwitches', () => ({ default: () => <p>permissões</p> }))
vi.mock('./RoleMembers', () => ({ default: () => <p>membros</p> }))

import { renderToStaticMarkup } from 'react-dom/server'
import RolesSection from './RolesSection'

function render(): string {
  state.roles = [
    role({ id: 'r1', name: 'Moderadores', position: 2 }),
    role({ id: 'everyone', name: '@everyone', is_default: true, position: 0 })
  ]
  return renderToStaticMarkup(<RolesSection />)
}

describe('RolesSection', () => {
  it('lista os cargos e abre o editor do primeiro', () => {
    const html = render()
    expect(html).toContain('Moderadores')
    expect(html).toContain('@everyone')
    expect(html).toContain('Criar cargo')
  })

  it('o editor do cargo tem a chave de deixar qualquer pessoa mencionar', () => {
    expect(render()).toContain('Permitir que qualquer pessoa mencione este cargo')
  })

  it('o cargo Bots não tem essa chave (cargo fixo não é mencionável)', () => {
    state.roles = [role({ id: 'bots', name: 'Bots', is_system: true })]
    const html = renderToStaticMarkup(<RolesSection />)
    expect(html).not.toContain('Permitir que qualquer pessoa mencione este cargo')
  })

  it('em tela estreita a lista fica em cima do editor (antes a lista de 230 px comia a tela)', () => {
    const html = render()
    expect(html).toMatch(/<div class="[^"]*[\s"]flex-col[\s"][^"]*md:flex-row/)
  })

  it('a lista só tem 230 px a partir de md', () => {
    const html = render()
    expect(html).toContain('md:w-[230px]')
    expect(html).not.toMatch(/[\s"]w-\[230px\]/)
  })

  it('as setas de ordenar aparecem sem depender do mouse em tela de toque', () => {
    const html = render()
    // visível por padrão; só some (até o hover) onde existe hover de verdade
    expect(html).not.toMatch(/[\s"]opacity-0[\s"]/)
    expect(html).toContain('[@media(hover:hover)]:opacity-0')
  })
})
