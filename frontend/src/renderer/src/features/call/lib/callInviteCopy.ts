import type { InviteResultStatus } from '../api/callInvites'

/**
 * Todos os textos do convite para a call (amigos e membros do servidor), num lugar só (para o
 * Hugo aprovar ou trocar sem caçar pelos componentes).
 */
export const INVITE_COPY = {
  buttonLabel: 'Convidar para a call',
  modalTitle: 'Convidar para a call',
  searchLabel: 'Buscar amigos e membros do servidor',
  searchPlaceholder: 'Buscar amigo ou membro',
  loadingFriends: 'Carregando…',
  noFriends: 'Ninguém para convidar ainda.',
  noMatches: 'Ninguém encontrado.',
  allInCall: 'Todo mundo já está na call.',
  friendsSection: 'Amigos',
  membersSection: 'Membros do servidor',
  selectAll: 'Selecionar todos',
  unselectAll: 'Desmarcar todos',
  selectAllLabel: (section: string): string => `Selecionar todos: ${section}`,
  unselectAllLabel: (section: string): string => `Desmarcar todos: ${section}`,
  online: 'Online',
  offline: 'Offline',
  selectedCount: (n: number): string =>
    n === 1 ? '1 pessoa selecionada' : `${n} pessoas selecionadas`,
  send: 'Enviar convites',
  sending: 'Enviando…',
  sentAll: (n: number): string => (n === 1 ? 'Convite enviado.' : `${n} convites enviados.`),
  sentSome: (ok: number, total: number): string =>
    `${ok} de ${total} convites enviados. Veja abaixo quem não pôde ser convidado.`,
  sentNone: 'Nenhum convite foi enviado.',
  requestFailed: 'Não foi possível enviar os convites. Tente de novo.',
  retry: 'Tentar de novo',
  close: 'Fechar',
  inviteMore: 'Convidar mais gente',
  cardTitleForGuest: (name: string): string => `${name} convidou você para a call`,
  cardTitleForAuthor: 'Você convidou para a call',
  fallbackPlace: 'Canal de voz',
  cardOpen: 'Abrir',
  cardInvalidTitle: 'Convite inválido',
  cardInvalidHint: 'Peça um novo convite',
  alreadyInDmCall: 'Você já está em uma chamada.',
  openFailed: 'Não foi possível abrir a call. Tente de novo.'
} as const

const RESULT_TEXT: Record<InviteResultStatus, string> = {
  sent: 'Convite enviado na conversa privada',
  already_invited: 'Já foi convidado há pouco',
  already_in_call: 'Já está na call',
  not_friend: 'Não é seu amigo nem membro do servidor',
  blocked: 'Não pode ser convidado',
  busy: 'Está em outra call',
  no_access: 'Sem acesso a este canal de voz',
  dms_closed: 'Só aceita mensagem de amigos',
  failed: 'Não foi possível enviar o convite'
}

export function resultText(status: InviteResultStatus | string): string {
  return RESULT_TEXT[status as InviteResultStatus] ?? 'Não foi possível convidar'
}
