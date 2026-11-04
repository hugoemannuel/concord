import { describe, expect, it } from 'vitest'
import type { Category } from '../api/categories'
import { isPrivateCategory, privacyChanged, privacyOf } from './categoryPrivacy'
import { Perm } from './permissions'

const category = (overwrites: Category['overwrites']): Category => ({ id: 'c', name: 'c', position: 0, overwrites })

describe('privacyOf', () => {
  it('categoria aberta', () => {
    expect(privacyOf(category([]), 'everyone')).toEqual({ private: false, role_ids: [], member_ids: [] })
    expect(privacyOf(undefined, 'everyone').private).toBe(false)
    expect(privacyOf(category(undefined), 'everyone').private).toBe(false)
  })
  it('privada: cargos e membros escolhidos', () => {
    const overwrites = [
      { target_type: 'role' as const, target_id: 'everyone', allow: 0, deny: Perm.VIEW_CHANNEL },
      { target_type: 'role' as const, target_id: 'vip', allow: Perm.VIEW_CHANNEL | Perm.CONNECT, deny: 0 },
      { target_type: 'member' as const, target_id: 'ana', allow: Perm.VIEW_CHANNEL, deny: 0 },
      { target_type: 'role' as const, target_id: 'mudo', allow: 0, deny: Perm.SEND_MESSAGES }
    ]
    expect(privacyOf(category(overwrites), 'everyone')).toEqual({ private: true, role_ids: ['vip'], member_ids: ['ana'] })
    expect(isPrivateCategory(category(overwrites), 'everyone')).toBe(true)
  })
  it('negar outra coisa ao @everyone não é ser privada', () => {
    const overwrites = [{ target_type: 'role' as const, target_id: 'everyone', allow: 0, deny: Perm.SEND_MESSAGES }]
    expect(isPrivateCategory(category(overwrites), 'everyone')).toBe(false)
  })
})

describe('privacyChanged', () => {
  const base = { private: true, role_ids: ['a', 'b'], member_ids: ['m'] }
  it('mesma lista em outra ordem não muda', () => {
    expect(privacyChanged(base, { private: true, role_ids: ['b', 'a'], member_ids: ['m'] })).toBe(false)
  })
  it('ligar, desligar ou trocar quem vê muda', () => {
    expect(privacyChanged(base, { ...base, private: false })).toBe(true)
    expect(privacyChanged(base, { ...base, role_ids: ['a'] })).toBe(true)
    expect(privacyChanged(base, { ...base, member_ids: [] })).toBe(true)
    expect(privacyChanged({ private: false, role_ids: [], member_ids: [] }, base)).toBe(true)
  })
  it('categoria aberta: a lista não importa', () => {
    expect(privacyChanged({ private: false, role_ids: ['a'], member_ids: [] }, { private: false, role_ids: [], member_ids: [] })).toBe(false)
  })
})
