import { describe, expect, it } from 'vitest'
import {
  findOverwrite,
  isEmptyOverwrite,
  isPrivateChannel,
  overwriteRows,
  privateOverwrite,
  targetRows,
  triState,
  withTriState
} from './channelPermissions'
import { Perm, type ChannelOverwrite, type Role } from './permissions'

const ow = (
  target_type: 'role' | 'member',
  target_id: string,
  allow = 0,
  deny = 0
): ChannelOverwrite => ({ target_type, target_id, allow, deny })

describe('triState / withTriState', () => {
  it('sem regra, tudo herda', () => {
    expect(triState(undefined, Perm.SEND_MESSAGES)).toBe('inherit')
    expect(triState(ow('role', 'a'), Perm.SEND_MESSAGES)).toBe('inherit')
  })

  it('lê negado e permitido', () => {
    const o = ow('role', 'a', Perm.SEND_MESSAGES, Perm.ADD_REACTIONS)
    expect(triState(o, Perm.SEND_MESSAGES)).toBe('allow')
    expect(triState(o, Perm.ADD_REACTIONS)).toBe('deny')
    expect(triState(o, Perm.ATTACH_FILES)).toBe('inherit')
  })

  it('troca um bit sem mexer nos outros', () => {
    const start = ow('role', 'a', Perm.SEND_MESSAGES, Perm.ADD_REACTIONS)
    const next = withTriState(start, { type: 'role', id: 'a' }, Perm.ATTACH_FILES, 'deny')
    expect(next).toMatchObject({
      target_type: 'role',
      target_id: 'a',
      allow: Perm.SEND_MESSAGES,
      deny: Perm.ADD_REACTIONS | Perm.ATTACH_FILES
    })
  })

  it('o mesmo bit nunca fica permitido e negado ao mesmo tempo', () => {
    let o = withTriState(undefined, { type: 'member', id: 'x' }, Perm.SEND_MESSAGES, 'allow')
    expect(o.allow & Perm.SEND_MESSAGES).not.toBe(0)
    o = withTriState(o, { type: 'member', id: 'x' }, Perm.SEND_MESSAGES, 'deny')
    expect(o.allow & Perm.SEND_MESSAGES).toBe(0)
    expect(o.deny & Perm.SEND_MESSAGES).not.toBe(0)
    o = withTriState(o, { type: 'member', id: 'x' }, Perm.SEND_MESSAGES, 'inherit')
    expect(o.allow | o.deny).toBe(0)
  })

  it('cria a sobrescrita quando não existia', () => {
    const o = withTriState(undefined, { type: 'role', id: 'novo' }, Perm.CONNECT, 'allow')
    expect(o).toMatchObject({
      target_type: 'role',
      target_id: 'novo',
      allow: Perm.CONNECT,
      deny: 0
    })
  })
})

describe('isEmptyOverwrite / findOverwrite', () => {
  it('vazia = sem allow nem deny', () => {
    expect(isEmptyOverwrite(undefined)).toBe(true)
    expect(isEmptyOverwrite(ow('role', 'a'))).toBe(true)
    expect(isEmptyOverwrite(ow('role', 'a', 1))).toBe(false)
    expect(isEmptyOverwrite(ow('role', 'a', 0, 1))).toBe(false)
  })

  it('acha pelo tipo e id', () => {
    const list = [ow('role', 'x', 1), ow('member', 'x', 2)]
    expect(findOverwrite(list, { type: 'member', id: 'x' })?.allow).toBe(2)
    expect(findOverwrite(list, { type: 'role', id: 'x' })?.allow).toBe(1)
    expect(findOverwrite(list, { type: 'role', id: 'y' })).toBeUndefined()
    expect(findOverwrite(undefined, { type: 'role', id: 'x' })).toBeUndefined()
  })
})

describe('canal privado', () => {
  it('é privado quando o @everyone não vê', () => {
    expect(isPrivateChannel([ow('role', 'everyone', 0, Perm.VIEW_CHANNEL)], 'everyone')).toBe(true)
    expect(isPrivateChannel([ow('role', 'everyone', 0, Perm.SEND_MESSAGES)], 'everyone')).toBe(
      false
    )
    expect(isPrivateChannel([ow('role', 'vip', 0, Perm.VIEW_CHANNEL)], 'everyone')).toBe(false)
    expect(isPrivateChannel(undefined, 'everyone')).toBe(false)
    expect(isPrivateChannel([ow('role', 'everyone', 0, Perm.VIEW_CHANNEL)], undefined)).toBe(false)
  })

  it('privateOverwrite liga e desliga só o VIEW_CHANNEL', () => {
    const list = [ow('role', 'everyone', Perm.ADD_REACTIONS, Perm.SEND_MESSAGES)]
    const on = privateOverwrite(list, 'everyone', true)
    expect(on.deny).toBe(Perm.SEND_MESSAGES | Perm.VIEW_CHANNEL)
    expect(on.allow).toBe(Perm.ADD_REACTIONS)
    const off = privateOverwrite([on], 'everyone', false)
    expect(off.deny).toBe(Perm.SEND_MESSAGES)
  })

  it('privateOverwrite funciona sem sobrescrita anterior', () => {
    expect(privateOverwrite([], 'everyone', true)).toMatchObject({
      target_type: 'role',
      target_id: 'everyone',
      allow: 0,
      deny: Perm.VIEW_CHANNEL
    })
  })
})

describe('overwriteRows', () => {
  const role = (id: string, position: number, extra: Partial<Role> = {}): Role => ({
    id,
    server_id: 's',
    name: id,
    color: null,
    position,
    permissions: 0,
    hoist: false,
    is_default: false,
    ...extra
  })
  const roles = [role('everyone', 0, { is_default: true }), role('mod', 2), role('vip', 1)]
  const names: Record<string, string> = { zeca: 'Zeca', ana: 'Ana' }

  it('@everyone, cargos do mais alto ao mais baixo e depois membros por nome', () => {
    const rows = overwriteRows(
      [
        ow('member', 'zeca'),
        ow('role', 'vip'),
        ow('member', 'ana'),
        ow('role', 'everyone'),
        ow('role', 'mod')
      ],
      roles,
      (id) => names[id]
    )
    expect(rows.map((r) => `${r.type}:${r.id}`)).toEqual([
      'role:everyone',
      'role:mod',
      'role:vip',
      'member:ana',
      'member:zeca'
    ])
  })

  it('alvos que não existem mais somem', () => {
    const rows = overwriteRows(
      [ow('role', 'apagado'), ow('member', 'saiu'), ow('role', 'vip')],
      roles,
      () => undefined
    )
    expect(rows.map((r) => r.id)).toEqual(['vip'])
  })
})

describe('targetRows', () => {
  const role = (id: string, position: number, is_default = false): Role =>
    ({ id, name: id, color: null, position, is_default }) as Role

  it('lista todos os cargos: @everyone primeiro, depois do mais alto ao mais baixo', () => {
    const rows = targetRows(
      undefined,
      [role('mod', 5), role('everyone', 0, true), role('admin', 9)],
      () => undefined
    )
    expect(rows.map((r) => r.id)).toEqual(['everyone', 'admin', 'mod'])
    expect(rows.every((r) => r.hasRules === false)).toBe(true)
  })

  it('marca quem tem regra e põe membros com regra no fim', () => {
    const rows = targetRows(
      [ow('role', 'mod', Perm.SEND_MESSAGES), ow('member', 'u1', 0, Perm.VIEW_CHANNEL)],
      [role('everyone', 0, true), role('mod', 5)],
      (id) => (id === 'u1' ? 'Ana' : undefined)
    )
    expect(rows.map((r) => [r.type, r.id, r.hasRules])).toEqual([
      ['role', 'everyone', false],
      ['role', 'mod', true],
      ['member', 'u1', true]
    ])
  })
})

describe('o bit mais alto (usar emojis de outros servidores)', () => {
  const target = { type: 'role' as const, id: 'vip' }

  it('sai sem sinal ao permitir e ao negar, como o servidor devolve', () => {
    const allowed = withTriState(undefined, target, Perm.USE_EXTERNAL_EMOJIS, 'allow')
    expect(allowed.allow).toBe(Perm.USE_EXTERNAL_EMOJIS)
    const denied = withTriState(allowed, target, Perm.USE_EXTERNAL_EMOJIS, 'deny')
    expect(denied).toMatchObject({ allow: 0, deny: Perm.USE_EXTERNAL_EMOJIS })
  })

  it('o estado reconhece o bit vindo do servidor', () => {
    const allowed = { target_type: 'role' as const, target_id: 'vip', allow: 2 ** 31, deny: 0 }
    expect(triState(allowed, Perm.USE_EXTERNAL_EMOJIS)).toBe('allow')
  })

  it('tirar o bit deixa a sobrescrita vazia', () => {
    const allowed = withTriState(undefined, target, Perm.USE_EXTERNAL_EMOJIS, 'allow')
    expect(isEmptyOverwrite(withTriState(allowed, target, Perm.USE_EXTERNAL_EMOJIS, 'inherit'))).toBe(true)
  })
})
