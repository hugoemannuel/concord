import { ApiError } from '../../../shared/api/client'

const GENERIC = 'Não foi possível salvar. Tente de novo.'

/**
 * O texto de erro para o usuário. O servidor manda mensagem em português junto
 * de um `code` quando o pedido tem problema (permissão, horário, antecedência...);
 * o resto (erro interno, sem conexão, corpo inválido) vira a mensagem genérica.
 */
export function eventErrorMessage(err: unknown): string {
  if (err instanceof ApiError && err.code && err.status < 500) return err.message
  return GENERIC
}
