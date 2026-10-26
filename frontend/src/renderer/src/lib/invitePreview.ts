import { commonMessage, statusOf } from './loginError'

const numberFormat = new Intl.NumberFormat('pt-BR')

/** "1 membro", "54.301 membros". */
export function formatInviteCount(count: number, singular: string, plural: string): string {
  return `${numberFormat.format(count)} ${count === 1 ? singular : plural}`
}

/** Falha ao abrir ou aceitar o convite, pelo status (o texto do backend pode mudar). */
export function inviteErrorMessage(err: unknown): string {
  const status = statusOf(err)
  if (status === 404) return 'Este convite é inválido ou expirou.'
  const code = (err as { code?: unknown } | null)?.code
  if (status === 403 && code === 'banned') return 'Você foi banido deste servidor.'
  if (status === 403 && code === 'email_not_verified') {
    return 'Confirme seu e-mail para entrar no servidor.'
  }
  return commonMessage(status, err) ?? 'Não foi possível abrir o convite.'
}
