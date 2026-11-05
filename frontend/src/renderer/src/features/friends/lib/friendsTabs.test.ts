import { describe, expect, it } from 'vitest'
import { addTabClass, parseFriendsTab, tabBadge, tabClass, tabHasSearch } from './friendsTabs'

describe('classes das abas', () => {
  it('aba ativa destacada, inativa discreta', () => {
    expect(tabClass(true)).toContain('text-strong')
    expect(tabClass(false)).toContain('text-muted')
  })
  it('"Adicionar amigo" é verde cheio fechado e texto verde aberto', () => {
    expect(addTabClass(false)).toContain('bg-success-strong')
    expect(addTabClass(true)).toContain('text-success')
  })
})

describe('parseFriendsTab', () => {
  it('aceita as abas conhecidas', () => {
    expect(parseFriendsTab('pending')).toBe('pending')
  })
  it('a aba antiga de convites não existe mais (o convite vai na DM)', () => {
    expect(parseFriendsTab('invites')).toBeNull()
  })
  it('ignora o desconhecido e o vazio', () => {
    expect(parseFriendsTab('nada')).toBeNull()
    expect(parseFriendsTab(null)).toBeNull()
  })
})

describe('tabHasSearch', () => {
  it('só as abas de pessoas têm busca', () => {
    expect(tabHasSearch('online')).toBe(true)
    expect(tabHasSearch('blocked')).toBe(true)
    expect(tabHasSearch('add')).toBe(false)
  })
})

describe('tabBadge', () => {
  const counts = { pending: 2 }
  it('pendente mostra os pedidos recebidos', () => {
    expect(tabBadge('pending', counts)).toBe(2)
  })
  it('as outras abas ficam sem selo', () => {
    expect(tabBadge('online', counts)).toBe(0)
  })
})
