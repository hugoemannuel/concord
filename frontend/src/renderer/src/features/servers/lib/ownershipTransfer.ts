import { ApiError } from '../../../shared/api/client'

// Transferir a posse do servidor (aba Membros): quem pode receber e as
// mensagens de erro (docs/adr/0038-excluir-a-propria-conta.md).

interface TransferCheck {
  viewerIsOwner: boolean
  meId: string | undefined
  member: { user_id: string; is_bot?: boolean }
}

/** Só o dono vê o botão, e só em outro membro que não é bot. */
export function canTransferTo({ viewerIsOwner, meId, member }: TransferCheck): boolean {
  return viewerIsOwner && member.user_id !== meId && !member.is_bot
}

export function transferErrorMessage(err: unknown): string {
  if (err instanceof ApiError && err.status === 400)
    return 'Essa pessoa não pode receber o servidor (precisa ser membro e não pode ser bot).'
  if (err instanceof ApiError && err.status === 403) return 'Só o dono pode transferir o servidor.'
  return 'Não foi possível transferir o servidor. Tente de novo.'
}
