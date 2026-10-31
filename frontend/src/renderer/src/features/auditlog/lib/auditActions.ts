import type { AuditAction, AuditEntry } from '../api/auditLog'

/** Cor do ícone: criar (verde), mudar (amarelo), apagar/punir (vermelho). */
export type ActionTone = 'create' | 'update' | 'delete'

/**
 * Frase com marcadores: {a} quem fez, {t} o alvo, {c} o canal onde foi, {r} o
 * cargo dado ou tirado. Os nomes saem em destaque.
 */
type Template = string | ((e: AuditEntry) => string)

interface ActionInfo {
  /** Rótulo do filtro. */
  label: string
  tone: ActionTone
  sentence: Template
}

const changeOf = (e: AuditEntry, field: string): { before?: unknown; after?: unknown } | undefined =>
  e.changes.find((c) => c.field === field)

const turnedOn = (e: AuditEntry, field: string): boolean => changeOf(e, field)?.after === true

const ACTIONS: Record<AuditAction, ActionInfo> = {
  'server.update': {
    label: 'Servidor atualizado',
    tone: 'update',
    sentence: (e) =>
      changeOf(e, 'primary_channel') ? '{a} definiu {c} como canal principal' : '{a} atualizou o servidor'
  },
  'bot.add': { label: 'Maestro adicionado', tone: 'create', sentence: '{a} adicionou {t} ao servidor' },
  'bot.remove': { label: 'Maestro removido', tone: 'delete', sentence: '{a} removeu {t} do servidor' },
  'invite.create': { label: 'Convite enviado', tone: 'create', sentence: '{a} convidou {t}' },
  'invite.reset': { label: 'Novo link de convite', tone: 'update', sentence: '{a} gerou um novo link de convite' },
  'guest_invite.create': {
    label: 'Convite de visitante criado',
    tone: 'create',
    sentence: '{a} criou um convite de visitante para {c}'
  },
  'guest_invite.delete': {
    label: 'Convite de visitante revogado',
    tone: 'delete',
    sentence: '{a} revogou um convite de visitante de {c}'
  },
  'guest.remove': { label: 'Visitante expulso', tone: 'delete', sentence: '{a} expulsou o visitante {t} de {c}' },
  'channel.create': { label: 'Canal criado', tone: 'create', sentence: '{a} criou o canal {t}' },
  'channel.update': { label: 'Canal editado', tone: 'update', sentence: '{a} editou o canal {t}' },
  'channel.delete': { label: 'Canal apagado', tone: 'delete', sentence: '{a} apagou o canal {t}' },
  'channel.reorder': {
    label: 'Canais reordenados',
    tone: 'update',
    sentence: (e) =>
      changeOf(e, 'type')?.after === 'voice'
        ? '{a} reordenou os canais de voz'
        : '{a} reordenou os canais de texto'
  },
  'channel.overwrite.update': {
    label: 'Permissões de canal alteradas',
    tone: 'update',
    sentence: '{a} alterou as permissões de {t} em {c}'
  },
  'channel.overwrite.delete': {
    label: 'Permissões de canal removidas',
    tone: 'delete',
    sentence: '{a} removeu as permissões de {t} em {c}'
  },
  'role.create': { label: 'Cargo criado', tone: 'create', sentence: '{a} criou o cargo {t}' },
  'role.update': { label: 'Cargo editado', tone: 'update', sentence: '{a} editou o cargo {t}' },
  'role.delete': { label: 'Cargo apagado', tone: 'delete', sentence: '{a} apagou o cargo {t}' },
  'role.reorder': { label: 'Cargos reordenados', tone: 'update', sentence: '{a} reordenou os cargos' },
  'member.role.add': { label: 'Cargo dado a membro', tone: 'create', sentence: '{a} deu o cargo {r} a {t}' },
  'member.role.remove': { label: 'Cargo tirado de membro', tone: 'delete', sentence: '{a} tirou o cargo {r} de {t}' },
  'member.join': { label: 'Membro entrou', tone: 'create', sentence: '{a} entrou no servidor' },
  'member.leave': { label: 'Membro saiu', tone: 'delete', sentence: '{a} saiu do servidor' },
  'member.kick': { label: 'Membro expulso', tone: 'delete', sentence: '{a} expulsou {t}' },
  'member.ban': { label: 'Membro banido', tone: 'delete', sentence: '{a} baniu {t}' },
  'member.unban': { label: 'Membro desbanido', tone: 'create', sentence: '{a} desbaniu {t}' },
  'member.nickname': { label: 'Apelido alterado', tone: 'update', sentence: '{a} mudou o apelido de {t}' },
  'voice.mute': {
    label: 'Silenciado na voz',
    tone: 'update',
    sentence: (e) => (turnedOn(e, 'mute') ? '{a} silenciou {t} em {c}' : '{a} liberou a voz de {t} em {c}')
  },
  'voice.deafen': {
    label: 'Ensurdecido na voz',
    tone: 'update',
    sentence: (e) => (turnedOn(e, 'deaf') ? '{a} ensurdeceu {t} em {c}' : '{a} liberou o áudio de {t} em {c}')
  },
  'voice.move': { label: 'Movido de canal de voz', tone: 'update', sentence: '{a} moveu {t} para {c}' },
  'voice.disconnect': { label: 'Desconectado da voz', tone: 'delete', sentence: '{a} desconectou {t} de {c}' },
  'message.delete': { label: 'Mensagem apagada', tone: 'delete', sentence: '{a} apagou uma mensagem de {t} em {c}' },
  'message.pin': { label: 'Mensagem fixada', tone: 'create', sentence: '{a} fixou uma mensagem de {t} em {c}' },
  'message.unpin': { label: 'Mensagem desafixada', tone: 'delete', sentence: '{a} desafixou uma mensagem de {t} em {c}' },
  'emoji.create': { label: 'Emoji adicionado', tone: 'create', sentence: '{a} adicionou o emoji {t}' },
  'emoji.delete': { label: 'Emoji removido', tone: 'delete', sentence: '{a} removeu o emoji {t}' },
  'sticker.create': { label: 'Figurinha adicionada', tone: 'create', sentence: '{a} adicionou a figurinha {t}' },
  'sticker.delete': { label: 'Figurinha removida', tone: 'delete', sentence: '{a} removeu a figurinha {t}' },
  'sound.create': { label: 'Som adicionado', tone: 'create', sentence: '{a} adicionou o som {t}' },
  'sound.delete': { label: 'Som removido', tone: 'delete', sentence: '{a} removeu o som {t}' },
  'event.create': { label: 'Evento criado', tone: 'create', sentence: '{a} criou o evento {t}' },
  'event.update': { label: 'Evento editado', tone: 'update', sentence: '{a} editou o evento {t}' },
  'event.delete': { label: 'Evento cancelado', tone: 'delete', sentence: '{a} cancelou o evento {t}' },
  'event.access': {
    label: 'Acesso aos eventos alterado',
    tone: 'update',
    sentence: '{a} mudou o que o cargo {t} pode fazer nos eventos'
  }
}

const UNKNOWN: ActionInfo = { label: 'Outra ação', tone: 'update', sentence: '{a} fez uma alteração' }

export const AUDIT_ACTIONS = Object.keys(ACTIONS) as AuditAction[]

/** Os grupos do filtro por tipo de ação. */
export const ACTION_GROUPS: { label: string; actions: AuditAction[] }[] = [
  { label: 'Servidor', actions: ['server.update', 'bot.add', 'bot.remove'] },
  {
    label: 'Convites',
    actions: ['invite.create', 'invite.reset', 'guest_invite.create', 'guest_invite.delete', 'guest.remove']
  },
  {
    label: 'Canais',
    actions: [
      'channel.create',
      'channel.update',
      'channel.delete',
      'channel.reorder',
      'channel.overwrite.update',
      'channel.overwrite.delete'
    ]
  },
  {
    label: 'Cargos',
    actions: ['role.create', 'role.update', 'role.delete', 'role.reorder', 'member.role.add', 'member.role.remove']
  },
  {
    label: 'Membros',
    actions: ['member.join', 'member.leave', 'member.kick', 'member.ban', 'member.unban', 'member.nickname']
  },
  { label: 'Voz', actions: ['voice.mute', 'voice.deafen', 'voice.move', 'voice.disconnect'] },
  { label: 'Mensagens', actions: ['message.delete', 'message.pin', 'message.unpin'] },
  {
    label: 'Emojis, figurinhas e sons',
    actions: ['emoji.create', 'emoji.delete', 'sticker.create', 'sticker.delete', 'sound.create', 'sound.delete']
  },
  { label: 'Eventos', actions: ['event.create', 'event.update', 'event.delete', 'event.access'] }
]

/** O que se sabe da ação (a desconhecida, de um servidor mais novo, vira "outra ação"). */
export function actionInfo(action: string): ActionInfo {
  return ACTIONS[action as AuditAction] ?? UNKNOWN
}

export interface SentencePart {
  text: string
  /** Nome em destaque (quem fez, alvo, canal, cargo). */
  strong?: boolean
}

function actorName(e: AuditEntry): string {
  if (e.actor_name) return `@${e.actor_name}`
  return e.actor_id ? 'Usuário removido' : 'O sistema'
}

function targetName(e: AuditEntry): string {
  if (!e.target_name) return '(sem nome)'
  return e.target_type === 'member' ? `@${e.target_name}` : e.target_name
}

function roleName(e: AuditEntry): string {
  const change = changeOf(e, 'role')
  return String(change?.after ?? change?.before ?? '(sem nome)')
}

const TOKENS: Record<string, (e: AuditEntry) => string> = {
  '{a}': actorName,
  '{t}': targetName,
  '{c}': (e) => e.channel_name || '(canal apagado)',
  '{r}': roleName
}

/** A frase do registro ("@Fulano expulsou @Ciclano"), com os nomes em destaque. */
export function describeEntry(e: AuditEntry): SentencePart[] {
  const { sentence } = actionInfo(e.action)
  const template = typeof sentence === 'function' ? sentence(e) : sentence
  return template
    .split(/(\{[atcr]\})/)
    .filter(Boolean)
    .map((part) => (TOKENS[part] ? { text: TOKENS[part](e), strong: true } : { text: part }))
}

/** A frase como texto corrido (leitor de tela e testes). */
export function sentenceText(parts: SentencePart[]): string {
  return parts.map((p) => p.text).join('')
}
