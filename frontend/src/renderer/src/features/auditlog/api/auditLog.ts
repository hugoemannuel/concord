import { request } from '../../../shared/api/client'
import { auditQuery, type AuditFilter } from '../lib/auditPages'

/** Ações do registro (o mesmo catálogo de backend/internal/audit/model.go). */
export type AuditAction =
  | 'server.update'
  | 'bot.add'
  | 'bot.remove'
  | 'invite.create'
  | 'invite.reset'
  | 'guest_invite.create'
  | 'guest_invite.delete'
  | 'guest.remove'
  | 'channel.create'
  | 'channel.update'
  | 'channel.delete'
  | 'channel.reorder'
  | 'channel.overwrite.update'
  | 'channel.overwrite.delete'
  | 'role.create'
  | 'role.update'
  | 'role.delete'
  | 'role.reorder'
  | 'member.role.add'
  | 'member.role.remove'
  | 'member.join'
  | 'member.leave'
  | 'member.kick'
  | 'member.ban'
  | 'member.unban'
  | 'member.nickname'
  | 'voice.mute'
  | 'voice.deafen'
  | 'voice.move'
  | 'voice.disconnect'
  | 'message.delete'
  | 'message.pin'
  | 'message.unpin'
  | 'emoji.create'
  | 'emoji.delete'
  | 'sticker.create'
  | 'sticker.delete'
  | 'sound.create'
  | 'sound.delete'
  | 'event.create'
  | 'event.update'
  | 'event.delete'
  | 'event.access'

export interface AuditChange {
  field: string
  before?: unknown
  after?: unknown
}

export interface AuditEntry {
  id: number
  action: AuditAction
  created_at: string
  /** Vazio: o sistema. */
  actor_id: string
  /** Vazio com actor_id: a conta não existe mais. */
  actor_name: string
  actor_avatar_url: string | null
  /** member, channel, role, server, invite, emoji, sticker, sound, event. */
  target_type: string
  target_id: string
  /** O nome da hora da ação (o de membro é o atual). */
  target_name: string
  /** Onde aconteceu (mensagem, voz, permissão de canal). */
  channel_id: string
  channel_name: string
  changes: AuditChange[]
  reason: string
}

export interface AuditPage {
  entries: AuditEntry[]
  /** Cursor da próxima página (null na última). */
  next_before: number | null
}

/** Uma página do registro, do mais recente para o mais antigo (só com a permissão). */
export function fetchAuditLog(serverId: string, filter: AuditFilter, before: number | null): Promise<AuditPage> {
  return request<AuditPage>(`/servers/${serverId}/audit-log${auditQuery(filter, before)}`)
}
