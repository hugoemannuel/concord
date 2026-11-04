import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { CategoryHeader, CategoryMenu } from './CategoryHeader'

const actions = {
  onToggle: vi.fn(),
  onCollapseAll: vi.fn(),
  onEdit: vi.fn(),
  onPermissions: vi.fn(),
  onDelete: vi.fn(),
  onMove: vi.fn(),
  onCreateChannel: vi.fn()
}
const menu = (props: Partial<React.ComponentProps<typeof CategoryMenu>> = {}): string =>
  renderToStaticMarkup(
    <CategoryMenu collapsed={false} canManage canManageRoles canMoveUp canMoveDown pick={vi.fn()} {...actions} {...props} />
  )

describe('menu da categoria', () => {
  it('quem gerencia move para cima e para baixo', () => {
    const html = menu()
    expect(html).toContain('Mover para cima')
    expect(html).toContain('Mover para baixo')
    expect(html).toContain('Excluir categoria')
  })
  it('no limite da lista some a direção que não existe', () => {
    expect(menu({ canMoveUp: false })).not.toContain('Mover para cima')
    expect(menu({ canMoveDown: false })).not.toContain('Mover para baixo')
  })
  it('quem não gerencia só recolhe', () => {
    const html = menu({ canManage: false })
    expect(html).toContain('Recolher categoria')
    expect(html).not.toContain('Mover para')
    expect(html).not.toContain('Excluir categoria')
  })
  it('permissões só para quem também gerencia cargos', () => {
    expect(menu()).toContain('Permissões da categoria')
    expect(menu({ canManageRoles: false })).not.toContain('Permissões da categoria')
  })
  it('recolhida oferece expandir', () => {
    expect(menu({ collapsed: true })).toContain('Expandir categoria')
  })
})

describe('cabeçalho da categoria', () => {
  const header = (canManage: boolean, collapsed = false): string =>
    renderToStaticMarkup(
      <CategoryHeader category={{ id: 'c', name: 'Jogos', position: 0 }} collapsed={collapsed} canManage={canManage} canManageRoles={canManage} canMoveUp canMoveDown dragProps={{}} {...actions} />
    )
  it('quem gerencia segura para arrastar sem selecionar o texto', () => {
    expect(header(true)).toContain('select-none')
    expect(header(false)).not.toContain('select-none')
  })
  it('quem gerencia cria canal direto no cabeçalho; quem não gerencia, não', () => {
    expect(header(true)).toContain('Criar canal em Jogos')
    expect(header(false)).not.toContain('Criar canal em Jogos')
  })
  it('categoria privada mostra o cadeado', () => {
    const html = renderToStaticMarkup(<CategoryHeader category={{ id: 'c', name: 'Jogos', position: 0 }} isPrivate collapsed={false} canManage canManageRoles canMoveUp canMoveDown dragProps={{}} {...actions} />)
    expect(html).toContain('(categoria privada)')
  })
  it('o botão diz se está aberta e os três pontos não começam arrasto', () => {
    expect(header(true)).toContain('aria-expanded="true"')
    expect(header(true, true)).toContain('aria-expanded="false"')
    expect(header(true)).toContain('data-no-drag')
  })
})
