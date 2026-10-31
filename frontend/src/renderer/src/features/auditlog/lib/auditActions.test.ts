import { describe, expect, it } from 'vitest'
import type { AuditEntry } from '../api/auditLog'
import { ACTION_GROUPS, AUDIT_ACTIONS, actionInfo, describeEntry, sentenceText } from './auditActions'

const entry = (over: Partial<AuditEntry>): AuditEntry => ({
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
  reason: '',
  ...over
})

const text = (over: Partial<AuditEntry>): string => sentenceText(describeEntry(entry(over)))

describe('frase de cada registro', () => {
  it('quem fez e o alvo membro vêm com @ e em destaque', () => {
    const parts = describeEntry(entry({}))
    expect(sentenceText(parts)).toBe('@Fulano expulsou @Ciclano')
    expect(parts.filter((p) => p.strong).map((p) => p.text)).toEqual(['@Fulano', '@Ciclano'])
  })

  it('canal, cargo e lugar entram pelo nome guardado', () => {
    expect(text({ action: 'channel.create', target_type: 'channel', target_name: 'geral' })).toBe(
      '@Fulano criou o canal geral'
    )
    expect(
      text({ action: 'message.delete', channel_name: 'geral' })
    ).toBe('@Fulano apagou uma mensagem de @Ciclano em geral')
    expect(
      text({
        action: 'channel.overwrite.update',
        target_type: 'role',
        target_name: 'Moderação',
        channel_name: 'segredo'
      })
    ).toBe('@Fulano alterou as permissões de Moderação em segredo')
    expect(
      text({ action: 'channel.overwrite.update', target_type: 'member', channel_name: 'segredo' })
    ).toBe('@Fulano alterou as permissões de @Ciclano em segredo')
  })

  it('dar e tirar cargo usam o cargo das mudanças', () => {
    expect(text({ action: 'member.role.add', changes: [{ field: 'role', after: 'VIP' }] })).toBe(
      '@Fulano deu o cargo VIP a @Ciclano'
    )
    expect(text({ action: 'member.role.remove', changes: [{ field: 'role', before: 'VIP' }] })).toBe(
      '@Fulano tirou o cargo VIP de @Ciclano'
    )
  })

  it('silenciar e liberar dependem do valor novo', () => {
    const at = { channel_name: 'Sala 1' }
    expect(text({ action: 'voice.mute', ...at, changes: [{ field: 'mute', after: true }] })).toBe(
      '@Fulano silenciou @Ciclano em Sala 1'
    )
    expect(text({ action: 'voice.mute', ...at, changes: [{ field: 'mute', after: false }] })).toBe(
      '@Fulano liberou a voz de @Ciclano em Sala 1'
    )
    expect(text({ action: 'voice.deafen', ...at, changes: [{ field: 'deaf', after: true }] })).toBe(
      '@Fulano ensurdeceu @Ciclano em Sala 1'
    )
    expect(text({ action: 'voice.deafen', ...at, changes: [{ field: 'deaf', after: false }] })).toBe(
      '@Fulano liberou o áudio de @Ciclano em Sala 1'
    )
  })

  it('reordenar canais diz o tipo; canal principal tem frase própria', () => {
    expect(text({ action: 'channel.reorder', changes: [{ field: 'type', after: 'voice' }] })).toBe(
      '@Fulano reordenou os canais de voz'
    )
    expect(text({ action: 'channel.reorder', changes: [{ field: 'type', after: 'text' }] })).toBe(
      '@Fulano reordenou os canais de texto'
    )
    expect(
      text({
        action: 'server.update',
        target_type: 'server',
        channel_name: 'avisos',
        changes: [{ field: 'primary_channel', after: 'c1' }]
      })
    ).toBe('@Fulano definiu avisos como canal principal')
    expect(text({ action: 'server.update', target_type: 'server', changes: [{ field: 'name' }] })).toBe(
      '@Fulano atualizou o servidor'
    )
  })

  it('sem nome: conta removida, sistema e item apagado', () => {
    expect(text({ actor_name: '' })).toBe('Usuário removido expulsou @Ciclano')
    expect(text({ actor_name: '', actor_id: '', action: 'member.join' })).toBe('O sistema entrou no servidor')
    expect(text({ action: 'channel.delete', target_type: 'channel', target_name: '' })).toBe(
      '@Fulano apagou o canal (sem nome)'
    )
  })

  it('ação desconhecida (app mais velho que o servidor) não quebra', () => {
    expect(text({ action: 'algo.novo' as AuditEntry['action'] })).toBe('@Fulano fez uma alteração')
    expect(actionInfo('algo.novo').tone).toBe('update')
  })
})

describe('catálogo de ações', () => {
  it('toda ação tem frase, rótulo, grupo e tom, e está em um grupo do filtro', () => {
    const grouped = ACTION_GROUPS.flatMap((g) => g.actions)
    expect([...grouped].sort()).toEqual([...AUDIT_ACTIONS].sort())
    for (const action of AUDIT_ACTIONS) {
      expect(actionInfo(action).label.length).toBeGreaterThan(0)
      expect(text({ action })).not.toBe('@Fulano fez uma alteração')
    }
  })

  it('apagar, expulsar e banir são vermelhos; criar é verde', () => {
    expect(actionInfo('member.ban').tone).toBe('delete')
    expect(actionInfo('channel.delete').tone).toBe('delete')
    expect(actionInfo('role.create').tone).toBe('create')
    expect(actionInfo('role.update').tone).toBe('update')
  })
})
