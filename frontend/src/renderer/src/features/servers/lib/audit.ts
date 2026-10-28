export const AUDIT_ACTIONS: Record<string, string> = {
  'channel.create': 'Canal criado',
  'channel.update': 'Canal alterado',
  'channel.delete': 'Canal excluído',
  'channel.reorder': 'Canais reordenados',
  'channel.overwrite.set': 'Permissões do canal alteradas',
  'channel.overwrite.delete': 'Permissões do canal removidas',
  'role.create': 'Cargo criado',
  'role.update': 'Cargo alterado',
  'role.delete': 'Cargo excluído',
  'role.reorder': 'Cargos reordenados',
  'role.member.add': 'Cargo atribuído',
  'role.member.remove': 'Cargo removido',
  'server.update': 'Servidor alterado',
  'server.icon.update': 'Ícone alterado',
  'server.icon.remove': 'Ícone removido',
  'server.primary_channel.update': 'Canal principal alterado',
  'server.invite_code.reset': 'Convite renovado',
  'member.join': 'Membro entrou',
  'member.leave': 'Membro saiu',
  'member.kick': 'Membro expulso',
  'member.ban': 'Membro banido',
  'member.unban': 'Membro desbanido',
  'member.nickname.update': 'Apelido alterado',
  'voice.server_mute': 'Silêncio no servidor alterado',
  'voice.server_deafen': 'Ensurdecimento no servidor alterado',
  'voice.move': 'Membro movido em voz',
  'voice.disconnect': 'Membro desconectado da voz'
}

export function auditValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não'
  if (Array.isArray(value)) return value.map(auditValue).join(', ') || '—'
  return String(value)
}
