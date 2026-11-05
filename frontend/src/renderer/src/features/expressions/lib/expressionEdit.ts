import { actionErrorMessage } from '../../servers/lib/permissionErrors'
import { expressionNameError, type ExpressionKind } from './expressionRules'

/** O que a edição em linha guarda: o nome e, nos sons, o emoji (vazio tira). */
export interface ExpressionEditValues {
  name: string
  emoji: string
}

export interface EditOutcome {
  /** Salvou: fecha a edição. */
  done: boolean
  /** Erro do campo (nome inválido). */
  error: string | null
  /** Aviso do servidor (nome repetido, sem permissão…). */
  toast: string | null
}

/** Confere o nome e salva; o que o servidor recusar vira aviso. */
export async function saveExpressionEdit(
  kind: ExpressionKind,
  values: ExpressionEditValues,
  save: (values: ExpressionEditValues) => Promise<unknown>,
  failMessage: string
): Promise<EditOutcome> {
  const error = expressionNameError(kind, values.name)
  if (error) return { done: false, error, toast: null }
  try {
    await save(values)
    return { done: true, error: null, toast: null }
  } catch (err) {
    return { done: false, error: null, toast: actionErrorMessage(err, failMessage) }
  }
}
