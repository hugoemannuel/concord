import { describe, expect, it } from 'vitest'
import { overlayMe } from './overlayMe'

const me = { id: 'u1', username: 'ana', display_name: 'Ana', avatar_url: '/global' }

describe('overlayMe', () => {
  it('sem sessão, nada', () => {
    expect(overlayMe(null, undefined, undefined)).toBeNull()
  })
  it('fora de servidor ou sem nada lá, o mesmo objeto', () => {
    expect(overlayMe(me, undefined, undefined)).toBe(me)
    expect(overlayMe(me, { u2: 'Outra' }, { u2: { bio: 'x' } })).toBe(me)
  })
  it('apelido vira o nome', () => {
    expect(overlayMe(me, { u1: 'Aninha' }, undefined)?.display_name).toBe('Aninha')
  })
  it('perfil do servidor troca o avatar', () => {
    const out = overlayMe(me, { u1: 'Aninha' }, { u1: { avatar_url: '/s1' } })
    expect(out?.avatar_url).toBe('/s1')
    expect(out?.display_name).toBe('Aninha')
  })
})
