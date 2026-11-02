import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { CategoryDialogs, type CategoryDialog } from './CategoryDialogs'

vi.mock('../../../shared/ui/Modal', () => ({ default: ({ title, children }: { title: string; children: React.ReactNode }) => <div><h2>{title}</h2>{children}</div> }))

describe('diálogos de categorias', () => {
  for (const [dialog, title] of [
    [{ kind: 'create' }, 'Criar categoria'],
    [{ kind: 'edit', category: { id: 'c', name: 'Jogos', position: 0 } }, 'Editar categoria'],
    [{ kind: 'delete', category: { id: 'c', name: 'Jogos', position: 0 } }, 'Excluir categoria']
  ] as [CategoryDialog, string][]) {
    it(title, () => {
      const html = renderToStaticMarkup(<CategoryDialogs serverId="s" dialog={dialog} close={vi.fn()} run={async () => true} />)
      expect(html).toContain(title)
      if (dialog.kind === 'delete') expect(html).toContain('serão mantidos')
      else expect(html).toContain('Nome da categoria')
    })
  }
})
