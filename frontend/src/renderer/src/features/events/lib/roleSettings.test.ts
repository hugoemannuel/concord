import { describe, expect, it, vi } from 'vitest'
import type { RoleSetting } from '../api/events'
import { ApiError } from '../../../shared/api/client'
import { ROLE_ACTIONS, actionsFor, persistRoleChange, withAction } from './roleSettings'

const roles: RoleSetting[] = [
  { role_id: 'a', name: 'Cargo A', create: true, edit: false, delete: false, configure: false },
  { role_id: 'b', name: 'Cargo B', create: false, edit: false, delete: false, configure: false }
]

describe('configuração dos cargos', () => {
  it('as quatro ações, na ordem da tela', () => {
    expect(ROLE_ACTIONS.map((a) => a.key)).toEqual(['create', 'edit', 'delete', 'configure'])
    expect(ROLE_ACTIONS.map((a) => a.label)).toEqual([
      'Criar eventos',
      'Editar eventos',
      'Excluir eventos',
      'Configurar eventos'
    ])
  })

  it('só o dono liga e desliga a quarta (configurar)', () => {
    expect(ROLE_ACTIONS.filter((a) => a.ownerOnly).map((a) => a.key)).toEqual(['configure'])
  })

  it('liga uma ação só no cargo certo', () => {
    const out = withAction(roles, 'b', 'edit', true)
    expect(out[1]).toEqual({ role_id: 'b', name: 'Cargo B', create: false, edit: true, delete: false, configure: false })
    expect(out[0]).toBe(roles[0])
  })

  it('desliga uma ação e mantém as outras', () => {
    expect(withAction([{ ...roles[0], edit: true }], 'a', 'create', false)[0]).toMatchObject({
      create: false,
      edit: true
    })
  })

  it('não muda a lista original', () => {
    withAction(roles, 'a', 'delete', true)
    expect(roles[0].delete).toBe(false)
  })

  it('cargo desconhecido deixa tudo como está', () => {
    expect(withAction(roles, 'zzz', 'edit', true)).toEqual(roles)
  })
})

describe('actionsFor', () => {
  it('devolve as quatro chaves do cargo como estão na lista', () => {
    expect(actionsFor([{ ...roles[0], edit: true, configure: true }], 'a')).toEqual({
      create: true,
      edit: true,
      delete: false,
      configure: true
    })
  })

  it('cargo que não está na lista não tem o que mandar', () => {
    expect(actionsFor(roles, 'zzz')).toBeNull()
  })
})

describe('persistRoleChange', () => {
  it('grava o cargo e devolve null quando deu certo', async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    expect(await persistRoleChange('s1', withAction(roles, 'a', 'edit', true), 'a', save)).toBeNull()
    expect(save).toHaveBeenCalledWith('s1', 'a', { create: true, edit: true, delete: false, configure: false })
  })

  it('devolve a mensagem do servidor quando ele recusa', async () => {
    const save = vi.fn().mockRejectedValue(new ApiError(403, 'você não tem permissão para isso', 'missing_permission'))
    expect(await persistRoleChange('s1', roles, 'a', save)).toBe('você não tem permissão para isso')
  })

  it('falha de rede vira a mensagem genérica', async () => {
    const save = vi.fn().mockRejectedValue(new Error('rede'))
    expect(await persistRoleChange('s1', roles, 'a', save)).toBe('Não foi possível salvar. Tente de novo.')
  })

  it('cargo desconhecido não chama o servidor', async () => {
    const save = vi.fn()
    expect(await persistRoleChange('s1', roles, 'zzz', save)).toBeNull()
    expect(save).not.toHaveBeenCalled()
  })
})
