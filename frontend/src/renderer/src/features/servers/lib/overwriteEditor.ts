import type { ServerMember } from '../api/servers'
import { serverDisplayName } from './serverNames'
import { findOverwrite, privateOverwrite, withTriState, type OverwriteRow, type OverwriteTargetRef } from './channelPermissions'
import { Perm, type ChannelKind, type ChannelOverwrite } from './permissions'

// Estado derivado do editor de permissões do canal (ChannelPermissionsModal):
// quem está selecionado, o que está salvo e o rascunho em edição.

const MAX_CANDIDATES = 8

export interface MemberCandidate {
  ref: OverwriteTargetRef
  name: string
}

/** Membros sem regra no canal que batem com a busca (os cargos já estão todos na lista). */
export function memberCandidates(
  members: ServerMember[],
  overwrites: ChannelOverwrite[] | undefined,
  term: string
): MemberCandidate[] {
  if (!term) return []
  return members
    .filter((m) => !findOverwrite(overwrites, { type: 'member', id: m.user_id }))
    .filter((m) =>
      [m.nickname, m.display_name, m.username].some((v) => v?.toLowerCase().includes(term))
    )
    .slice(0, MAX_CANDIDATES)
    .map((m) => ({ ref: { type: 'member' as const, id: m.user_id }, name: serverDisplayName(m, m) }))
}

export interface EditorSelection {
  current: OverwriteTargetRef | null
  saved: ChannelOverwrite | undefined
  /** O rascunho, se for do alvo atual; senão o salvo. */
  working: ChannelOverwrite | undefined
  dirty: boolean
  /** As linhas mais o alvo recém-adicionado, que ainda não tem regra salva. */
  allRows: OverwriteRow[]
}

interface SelectionInput {
  rows: OverwriteRow[]
  overwrites: ChannelOverwrite[] | undefined
  selected: OverwriteTargetRef | null
  draft: ChannelOverwrite | null
  memberName: (id: string) => string | undefined
}

const sameTarget = (o: ChannelOverwrite, ref: OverwriteTargetRef): boolean =>
  o.target_id === ref.id && o.target_type === ref.type

function isDirty(draft: ChannelOverwrite | null, saved: ChannelOverwrite | undefined): boolean {
  if (!draft) return false
  return draft.allow !== (saved?.allow ?? 0) || draft.deny !== (saved?.deny ?? 0)
}

function firstRow(rows: OverwriteRow[]): OverwriteTargetRef | null {
  return rows[0] ? { type: rows[0].type, id: rows[0].id } : null
}

function withPending(
  rows: OverwriteRow[],
  current: OverwriteTargetRef | null,
  memberName: SelectionInput['memberName']
): OverwriteRow[] {
  if (!current || rows.some((r) => r.type === current.type && r.id === current.id)) return rows
  return [...rows, { ...current, name: memberName(current.id) ?? '?', color: null, hasRules: false }]
}

export function editorSelection({
  rows,
  overwrites,
  selected,
  draft,
  memberName
}: SelectionInput): EditorSelection {
  const current = selected ?? firstRow(rows)
  const saved = current ? findOverwrite(overwrites, current) : undefined
  const working = draft && current && sameTarget(draft, current) ? draft : saved
  return {
    current,
    saved,
    working,
    dirty: isDirty(draft, saved),
    allRows: withPending(rows, current, memberName)
  }
}

/** Tipo do canal no editor e os textos que mudam com ele. */
export function channelPermissionsCopy(channel: { type: string; name: string }): {
  kind: ChannelKind
  title: string
  privateHint: string
} {
  const voice = channel.type === 'voice'
  return {
    kind: voice ? 'voice' : 'text',
    title: `Permissões de ${voice ? '' : '#'}${channel.name}`,
    privateHint: `Só os cargos e membros que você liberar abaixo conseguem ver ${voice ? 'e entrar n' : ''}este canal.`
  }
}

/** Ligar ou desligar o privado: a regra do @everyone e, se precisar, a de quem está mexendo. */
export function privateToggleWrites(input: {
  overwrites: ChannelOverwrite[] | undefined
  everyoneId: string
  makePrivate: boolean
  /** Dono e Administrador não precisam: veem sempre. */
  alwaysSees: boolean
  meId: string
  kind: ChannelKind | 'category'
}): ChannelOverwrite[] {
  const { overwrites, everyoneId, makePrivate, alwaysSees, meId, kind } = input
  const writes = [privateOverwrite(overwrites, everyoneId, makePrivate)]
  if (!makePrivate || alwaysSees) return writes
  // Quem torna privado sem ter acesso garantido por cargo não se tranca fora.
  const me: OverwriteTargetRef = { type: 'member', id: meId }
  const access = kind === 'text' ? Perm.VIEW_CHANNEL : Perm.VIEW_CHANNEL | Perm.CONNECT
  return [...writes, withTriState(findOverwrite(overwrites, me), me, access, 'allow')]
}
