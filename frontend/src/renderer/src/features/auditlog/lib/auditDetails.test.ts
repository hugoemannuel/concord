import { describe, expect, it } from 'vitest'
import type { AuditEntry } from '../api/auditLog'
import { Perm } from '../../servers/lib/permissions'
import { describeChanges } from './auditDetails'

const entry = (over: Partial<AuditEntry>): AuditEntry => ({
  id: 1,
  action: 'role.update',
  created_at: '2026-10-30T12:00:00Z',
  actor_id: 'a1',
  actor_name: 'Fulano',
  actor_avatar_url: null,
  target_type: 'role',
  target_id: 'r1',
  target_name: 'VIP',
  channel_id: '',
  channel_name: '',
  changes: [],
  reason: '',
  ...over
})

describe('detalhes do que mudou', () => {
  it('nome, cor e separação: antes e depois legíveis', () => {
    const rows = describeChanges(
      entry({
        changes: [
          { field: 'name', before: 'VIP', after: 'Super VIP' },
          { field: 'color', after: 0xff8800 },
          { field: 'hoist', before: false, after: true }
        ]
      })
    )
    expect(rows).toEqual([
      { label: 'Nome', before: 'VIP', after: 'Super VIP' },
      { label: 'Cor', before: 'sem cor', after: '#FF8800' },
      { label: 'Mostrar separado', before: 'Não', after: 'Sim' }
    ])
  })

  it('permissões viram a lista do que entrou e do que saiu', () => {
    const rows = describeChanges(
      entry({
        changes: [
          {
            field: 'permissions',
            before: Perm.KICK_MEMBERS | Perm.SPEAK,
            after: Perm.SPEAK | Perm.BAN_MEMBERS | Perm.VIEW_AUDIT_LOG
          }
        ]
      })
    )
    expect(rows).toEqual([
      {
        label: 'Permissões',
        // Na ordem da tela de cargos.
        added: ['Ver registro de auditoria', 'Banir membros'],
        removed: ['Expulsar membros']
      }
    ])
  })

  it('sobrescritas do canal: permitido e negado', () => {
    const rows = describeChanges(
      entry({
        action: 'channel.overwrite.update',
        changes: [
          { field: 'allow', before: 0, after: Perm.VIEW_CHANNEL },
          { field: 'deny', before: Perm.VIEW_CHANNEL, after: 0 }
        ]
      })
    )
    expect(rows).toEqual([
      { label: 'Permitido', added: ['Ver canais'], removed: [] },
      { label: 'Negado', added: [], removed: ['Ver canais'] }
    ])
  })

  it('apelido, ícone, tipo e canal principal', () => {
    expect(
      describeChanges(entry({ action: 'member.nickname', changes: [{ field: 'nick', before: 'Ana' }] }))
    ).toEqual([{ label: 'Apelido', before: 'Ana', after: 'sem apelido' }])
    expect(
      describeChanges(entry({ action: 'server.update', changes: [{ field: 'icon', before: '/a.png', after: '' }] }))
    ).toEqual([{ label: 'Ícone', before: 'imagem', after: 'sem ícone' }])
    expect(
      describeChanges(
        entry({ action: 'channel.create', changes: [{ field: 'type', after: 'voice' }, { field: 'private', after: true }] })
      )
    ).toEqual([
      { label: 'Tipo', after: 'Voz' },
      { label: 'Privado', after: 'Sim' }
    ])
    expect(
      describeChanges(
        entry({ action: 'server.update', channel_name: 'avisos', changes: [{ field: 'primary_channel', after: 'c1' }] })
      )
    ).toEqual([{ label: 'Canal principal', after: 'avisos' }])
  })

  it('eventos e convites de visitante', () => {
    const rows = describeChanges(
      entry({
        action: 'event.create',
        changes: [
          { field: 'duration_minutes', before: 0, after: 90 },
          { field: 'recurrence', before: '', after: 'weekly' },
          { field: 'duration', after: '24h' },
          { field: 'can_stream', after: false },
          { field: 'event_actions', after: 3 },
          { field: 'starts_at', before: '', after: '2026-11-01T13:00:00Z' }
        ]
      })
    )
    expect(rows.slice(0, 5)).toEqual([
      { label: 'Duração', after: '1 h 30 min' },
      { label: 'Repetição', after: 'Toda semana' },
      { label: 'Duração do link', after: '1 dia' },
      { label: 'Câmera e tela', after: 'Não' },
      { label: 'Ações nos eventos', after: 'Criar, Editar' }
    ])
    expect(rows[5]).toMatchObject({ label: 'Início' })
    expect(rows[5]).not.toHaveProperty('before')
    expect(rows[5] && 'after' in rows[5] && rows[5].after).toMatch(/2026/)
    // Editar mostra o antes, mesmo vazio.
    expect(
      describeChanges(entry({ action: 'event.update', changes: [{ field: 'duration_minutes', before: 60, after: 90 }] }))
    ).toEqual([{ label: 'Duração', before: '1 h', after: '1 h 30 min' }])
  })

  it('o que já está na frase não repete; o motivo entra no fim', () => {
    expect(
      describeChanges(entry({ action: 'member.role.add', changes: [{ field: 'role', after: 'VIP' }] }))
    ).toEqual([])
    expect(describeChanges(entry({ action: 'voice.mute', changes: [{ field: 'mute', after: true }] }))).toEqual([])
    expect(describeChanges(entry({ action: 'member.ban', reason: 'spam' }))).toEqual([
      { label: 'Motivo', after: 'spam' }
    ])
  })

  it('campo desconhecido aparece com o nome cru', () => {
    expect(describeChanges(entry({ changes: [{ field: 'outro', before: 1, after: 2 }] }))).toEqual([
      { label: 'outro', before: '1', after: '2' }
    ])
  })
})
