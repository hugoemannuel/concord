import { ApiError } from '../../../shared/api/client'

// Excluir a própria conta (Configurações → Minha conta; cópia do desktop): a checagem antes de
// mandar e a tradução dos erros (docs/adr/0038-excluir-a-propria-conta.md).

export interface OwnedServer {
  id: string
  name: string
}

export type DeletionFailure =
  | { kind: 'message'; message: string }
  /** Dono de servidor com membros: transfira a posse ou apague antes. */
  | { kind: 'owns_servers'; servers: OwnedServer[] }

const GENERIC = 'Não foi possível excluir a conta. Tente de novo.'

const message = (text: string): DeletionFailure => ({ kind: 'message', message: text })

function isOwnedServer(raw: unknown): raw is OwnedServer {
  const s = raw as Partial<OwnedServer> | null
  return typeof s?.id === 'string' && typeof s?.name === 'string'
}

/** Mensagem (ou a lista de servidores) para o erro do POST /users/me/delete. */
export function deletionFailure(err: unknown): DeletionFailure {
  if (!(err instanceof ApiError)) return message(GENERIC)
  if (err.code === 'owns_servers') {
    const raw = Array.isArray(err.body?.servers) ? err.body.servers : []
    return { kind: 'owns_servers', servers: raw.filter(isOwnedServer) }
  }
  if (err.code === 'wrong_password') return message('Senha incorreta.')
  if (err.status === 429)
    return message('Muitas tentativas. Espere alguns minutos e tente de novo.')
  return message(GENERIC)
}

export interface AccountDeletion {
  password: string
  confirmed: boolean
  send: (password: string) => Promise<void>
}

/** Confere e manda; null = conta excluída. */
export async function submitAccountDeletion(
  input: AccountDeletion
): Promise<DeletionFailure | null> {
  if (!input.password) return message('Digite a sua senha.')
  if (!input.confirmed) return message('Marque que você entende que não dá para desfazer.')
  try {
    await input.send(input.password)
    return null
  } catch (err) {
    return deletionFailure(err)
  }
}
