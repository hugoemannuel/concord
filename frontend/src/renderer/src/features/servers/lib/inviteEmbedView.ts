import type { InvitePreview } from '../api/invites'
import type { InvitePreviewEntry } from '../store/invitePreviewCacheStore'

export type InviteEmbedView =
  | { kind: 'loading' }
  | { kind: 'invalid'; hint: string }
  | { kind: 'ready'; title: string; preview: InvitePreview; action: 'join' | 'open' }

/**
 * O que o cartão do convite mostra. Já é membro vem do servidor (is_member) ou
 * da lista local de servidores (entrou agora pelo próprio cartão).
 */
export function inviteEmbedView(
  entry: InvitePreviewEntry | undefined,
  isMine: boolean,
  myServerIds: readonly string[]
): InviteEmbedView {
  if (!entry || entry.status === 'loading') return { kind: 'loading' }
  if (entry.status === 'error') return { kind: 'invalid', hint: entry.message }
  const { preview } = entry
  const member =
    preview.is_member === true || (!!preview.server_id && myServerIds.includes(preview.server_id))
  return {
    kind: 'ready',
    title: isMine
      ? 'Você enviou um convite para um servidor'
      : 'Você foi convidado(a) para entrar num servidor',
    preview,
    action: member ? 'open' : 'join'
  }
}
