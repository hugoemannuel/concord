import { Perm } from './permissions'
import { describe, expect, it } from 'vitest'
import { channelPermissionsCopy, editorSelection, memberCandidates, privateToggleWrites } from './overwriteEditor'
import type { ChannelOverwrite } from './permissions'
import type { OverwriteRow } from './channelPermissions'
import type { ServerMember } from '../api/servers'

const member = (user_id: string, username: string, nickname?: string): ServerMember =>
  ({ user_id, username, nickname, display_name: undefined }) as unknown as ServerMember

const rule = (target_id: string, allow = 0, deny = 0): ChannelOverwrite => ({
  target_type: 'member',
  target_id,
  allow,
  deny
})

describe('memberCandidates', () => {
  const members = [member('1', 'ana'), member('2', 'bruno', 'Bru'), member('3', 'anabela')]

  it('sem termo, ninguém', () => {
    expect(memberCandidates(members, [], '')).toEqual([])
  })

  it('acha por apelido ou usuário, sem quem já tem regra', () => {
    const found = memberCandidates(members, [rule('3')], 'ana')
    expect(found).toEqual([{ ref: { type: 'member', id: '1' }, name: 'ana' }])
    expect(memberCandidates(members, [], 'bru')[0].name).toBe('Bru')
  })

  it('no máximo 8', () => {
    const many = Array.from({ length: 12 }, (_, i) => member(String(i), `ana${i}`))
    expect(memberCandidates(many, undefined, 'ana')).toHaveLength(8)
  })
})

describe('editorSelection', () => {
  const rows: OverwriteRow[] = [
    { type: 'role', id: 'everyone', name: '@everyone', color: null, hasRules: false },
    { type: 'member', id: 'u1', name: 'Ana', color: null, hasRules: true }
  ]
  const overwrites = [rule('u1', 4, 0)]
  const name = (id: string): string | undefined => (id === 'u9' ? 'Zé' : undefined)
  const base = { rows, overwrites, memberName: name, selected: null, draft: null }

  it('sem seleção, abre na primeira linha', () => {
    const s = editorSelection(base)
    expect(s.current).toEqual({ type: 'role', id: 'everyone' })
    expect(s.saved).toBeUndefined()
    expect(s.dirty).toBe(false)
    expect(s.allRows).toBe(rows)
  })

  it('sem nenhuma linha, nada selecionado', () => {
    expect(editorSelection({ ...base, rows: [] }).current).toBeNull()
  })

  it('o rascunho do alvo atual vale e fica sujo quando difere do salvo', () => {
    const selected = { type: 'member' as const, id: 'u1' }
    const same = editorSelection({ ...base, selected, draft: rule('u1', 4, 0) })
    expect(same.working).toEqual(rule('u1', 4, 0))
    expect(same.dirty).toBe(false)
    const changed = editorSelection({ ...base, selected, draft: rule('u1', 4, 8) })
    expect(changed.dirty).toBe(true)
  })

  it('rascunho de outro alvo não vale: mostra o salvo', () => {
    const s = editorSelection({ ...base, selected: { type: 'member', id: 'u1' }, draft: rule('u2', 1) })
    expect(s.working).toEqual(overwrites[0])
  })

  it('alvo recém-adicionado (sem regra) entra no fim da lista', () => {
    const s = editorSelection({ ...base, selected: { type: 'member', id: 'u9' } })
    expect(s.allRows.at(-1)).toEqual({ type: 'member', id: 'u9', name: 'Zé', color: null, hasRules: false })
    const unknown = editorSelection({ ...base, selected: { type: 'member', id: 'u8' } })
    expect(unknown.allRows.at(-1)?.name).toBe('?')
  })
})

describe('channelPermissionsCopy', () => {
  it('texto: título com # e "ver este canal"', () => {
    expect(channelPermissionsCopy({ type: 'text', name: 'geral' })).toEqual({
      kind: 'text',
      title: 'Permissões de #geral',
      privateHint: 'Só os cargos e membros que você liberar abaixo conseguem ver este canal.'
    })
  })

  it('voz: título sem # e "ver e entrar neste canal"', () => {
    const copy = channelPermissionsCopy({ type: 'voice', name: 'resenha' })
    expect(copy.kind).toBe('voice')
    expect(copy.title).toBe('Permissões de resenha')
    expect(copy.privateHint).toContain('ver e entrar neste canal')
  })
})

describe('privateToggleWrites', () => {
  const base = { overwrites: [], everyoneId: 'everyone', meId: 'ana' }
  it('tornar privado nega ver ao @everyone e não tranca quem está mexendo', () => {
    const [everyone, me] = privateToggleWrites({ ...base, makePrivate: true, alwaysSees: false, kind: 'text' })
    expect(everyone).toMatchObject({ target_id: 'everyone', deny: Perm.VIEW_CHANNEL })
    expect(me).toMatchObject({ target_type: 'member', target_id: 'ana', allow: Perm.VIEW_CHANNEL })
  })
  it('em voz e em categoria, quem mexe também conecta', () => {
    for (const kind of ['voice', 'category'] as const) {
      const [, me] = privateToggleWrites({ ...base, makePrivate: true, alwaysSees: false, kind })
      expect(me.allow).toBe(Perm.VIEW_CHANNEL | Perm.CONNECT)
    }
  })
  it('dono e Administrador veem sempre: só a regra do @everyone', () => {
    expect(privateToggleWrites({ ...base, makePrivate: true, alwaysSees: true, kind: 'text' })).toHaveLength(1)
  })
  it('abrir é só tirar o negar do @everyone', () => {
    expect(privateToggleWrites({ ...base, makePrivate: false, alwaysSees: false, kind: 'text' })).toHaveLength(1)
  })
})
