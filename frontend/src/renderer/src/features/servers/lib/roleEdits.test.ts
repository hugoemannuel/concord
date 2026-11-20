import { describe, expect, it } from 'vitest'
import type { Role } from './permissions'
import { isRoleDirty, roleDraft, roleInputFor } from './roleEdits'

const role: Role = {
  id: 'r1',
  server_id: 's1',
  name: 'Suporte',
  color: 0x3366ff,
  position: 2,
  permissions: 8,
  hoist: false,
  is_default: false,
  mentionable: false
}

describe('roleDraft', () => {
  it('sem edição, o rascunho é o próprio cargo', () => {
    expect(roleDraft(role, {})).toEqual({
      name: 'Suporte',
      color: 0x3366ff,
      hoist: false,
      mentionable: false,
      permissions: 8
    })
  })

  it('só o que a pessoa mexeu fica por cima; o resto acompanha o cargo', () => {
    const draft = roleDraft({ ...role, name: 'Renomeado por outro' }, { hoist: true, mentionable: true })
    expect(draft.name).toBe('Renomeado por outro')
    expect(draft.hoist).toBe(true)
    expect(draft.mentionable).toBe(true)
  })

  it('tirar a cor (null) é uma edição, diferente de não mexer', () => {
    expect(roleDraft(role, { color: null }).color).toBeNull()
    expect(roleDraft(role, {}).color).toBe(0x3366ff)
  })

  it('cargo antigo sem o campo mentionable conta como desligado', () => {
    const old = { ...role, mentionable: undefined }
    expect(roleDraft(old, {}).mentionable).toBe(false)
    expect(isRoleDirty(old, roleDraft(old, {}))).toBe(false)
  })
})

describe('isRoleDirty / roleInputFor', () => {
  it('rascunho igual ao cargo: nada a salvar', () => {
    const draft = roleDraft(role, {})
    expect(isRoleDirty(role, draft)).toBe(false)
    expect(roleInputFor(role, draft)).toEqual({})
  })

  it('só o que mudou vai para o servidor, com o nome aparado', () => {
    const draft = roleDraft(role, { name: '  Ajuda ', mentionable: true })
    expect(isRoleDirty(role, draft)).toBe(true)
    expect(roleInputFor(role, draft)).toEqual({ name: 'Ajuda', mentionable: true })
  })

  it('cada campo sozinho já deixa o cargo com alteração', () => {
    for (const edits of [{ color: 0xff0000 }, { hoist: true }, { permissions: 9 }, { mentionable: true }]) {
      expect(isRoleDirty(role, roleDraft(role, edits))).toBe(true)
    }
  })

  it('cor: trocar manda a cor; tirar manda clear_color', () => {
    expect(roleInputFor(role, roleDraft(role, { color: 0xff0000 }))).toEqual({ color: 0xff0000 })
    expect(roleInputFor(role, roleDraft(role, { color: null }))).toEqual({ clear_color: true })
  })

  it('exibir separado e permissões', () => {
    expect(roleInputFor(role, roleDraft(role, { hoist: true, permissions: 9 }))).toEqual({
      hoist: true,
      permissions: 9
    })
  })
})
