import { describe, expect, it, vi } from 'vitest'
import type { AuditEntry } from '../api/auditLog'

const state = vi.hoisted(() => ({
  log: { entries: [] as unknown[], next: null as number | null, loading: false, failed: false }
}))

vi.mock('../../servers/store/serverStore', () => ({
  useServerStore: (select: (s: unknown) => unknown) =>
    select({
      currentServer: { id: 's1' },
      currentMembers: [{ user_id: 'a1', display_name: 'Fulano', username: 'fulano', nickname: null }]
    })
}))
vi.mock('../hooks/useAuditLog', () => ({
  useAuditLog: () => ({ ...state.log, loadMore: vi.fn(), retry: vi.fn() })
}))

import { renderToStaticMarkup } from 'react-dom/server'
import AuditLogSection from './AuditLogSection'

const kick = {
  id: 1,
  action: 'member.kick',
  created_at: '2026-10-30T12:00:00Z',
  actor_id: 'a1',
  actor_name: 'Fulano',
  actor_avatar_url: null,
  target_type: 'member',
  target_id: 'b2',
  target_name: 'Ciclano',
  channel_id: '',
  channel_name: '',
  changes: [],
  reason: ''
} satisfies AuditEntry

const render = (log: Partial<typeof state.log>): string => {
  state.log = { entries: [], next: null, loading: false, failed: false, ...log }
  return renderToStaticMarkup(<AuditLogSection />)
}

describe('AuditLogSection', () => {
  it('filtros por usuário (membros) e por ação (agrupadas)', () => {
    const html = render({})
    expect(html).toContain('Filtrar por usuário')
    expect(html).toContain('<option value="a1" class="bg-floating">Fulano</option>')
    expect(html).toContain('<optgroup label="Membros"')
    expect(html).toContain('Membro expulso')
  })

  it('lista as linhas e oferece carregar mais quando há próxima página', () => {
    const html = render({ entries: [kick], next: 1 })
    expect(html).toContain('aria-label="Registro de auditoria"')
    expect(html).toContain('Ciclano')
    expect(html).toContain('Carregar mais')
  })

  it('vazio, carregando e falha', () => {
    expect(render({})).toContain('Nada foi registrado ainda.')
    expect(render({ loading: true })).toContain('Carregando o registro')
    const failed = render({ failed: true })
    expect(failed).toContain('Não foi possível carregar o registro de auditoria.')
    expect(failed).toContain('Tentar de novo')
  })
})
