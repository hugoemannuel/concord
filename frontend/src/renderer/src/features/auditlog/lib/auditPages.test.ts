import { describe, expect, it } from 'vitest'
import type { AuditEntry } from '../api/auditLog'
import { INITIAL_AUDIT_LIST, auditListReducer, auditQuery, mergeEntries } from './auditPages'

const e = (id: number): AuditEntry => ({ id }) as AuditEntry

describe('páginas do registro', () => {
  it('junta a página nova no fim, sem repetir', () => {
    expect(mergeEntries([e(9), e(8)], [e(8), e(7)]).map((x) => x.id)).toEqual([9, 8, 7])
    expect(mergeEntries([], [e(3)]).map((x) => x.id)).toEqual([3])
  })

  it('monta a query só com o que filtra', () => {
    expect(auditQuery({}, null)).toBe('')
    expect(auditQuery({ actorId: 'u1', action: 'member.ban' }, 42)).toBe('?actor_id=u1&action=member.ban&before=42')
    expect(auditQuery({ action: '' }, 7)).toBe('?before=7')
  })
})

describe('estado da lista', () => {
  it('carrega, acumula páginas e recomeça ao trocar o filtro', () => {
    let s = auditListReducer(INITIAL_AUDIT_LIST, { type: 'page', entries: [e(9), e(8)], next: 8 })
    expect(s).toMatchObject({ loading: false, next: 8 })
    s = auditListReducer(s, { type: 'start', reset: false })
    expect(s.loading).toBe(true)
    expect(s.entries).toHaveLength(2)
    s = auditListReducer(s, { type: 'page', entries: [e(7)], next: null })
    expect(s.entries.map((x) => x.id)).toEqual([9, 8, 7])
    expect(s.next).toBeNull()
    expect(auditListReducer(s, { type: 'start', reset: true })).toEqual(INITIAL_AUDIT_LIST)
  })

  it('falha mantém o que já tinha e para de carregar', () => {
    const s = auditListReducer({ ...INITIAL_AUDIT_LIST, entries: [e(1)] }, { type: 'fail' })
    expect(s).toMatchObject({ loading: false, failed: true })
    expect(s.entries).toHaveLength(1)
  })
})
