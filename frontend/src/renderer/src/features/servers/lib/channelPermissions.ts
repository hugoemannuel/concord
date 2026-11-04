import { Perm, type ChannelOverwrite, type OverwriteTarget, type Role } from './permissions'

// Editor de permissões do canal: para cada cargo ou membro, cada permissão
// está em um de três estados — negada (✗), herdada do servidor (/) ou
// permitida (✓).

export type TriState = 'deny' | 'inherit' | 'allow'

export interface OverwriteTargetRef {
  type: OverwriteTarget
  id: string
}

export function triState(o: ChannelOverwrite | undefined, bit: number): TriState {
  if (!o) return 'inherit'
  if (o.deny & bit) return 'deny'
  if (o.allow & bit) return 'allow'
  return 'inherit'
}

/** A sobrescrita com a permissão `bit` no estado pedido (as outras ficam como estão). */
export function withTriState(
  o: ChannelOverwrite | undefined,
  target: OverwriteTargetRef,
  bit: number,
  state: TriState
): ChannelOverwrite {
  const allow = (o?.allow ?? 0) & ~bit
  const deny = (o?.deny ?? 0) & ~bit
  return {
    channel_id: o?.channel_id,
    target_type: target.type,
    target_id: target.id,
    allow: (state === 'allow' ? allow | bit : allow) >>> 0,
    deny: (state === 'deny' ? deny | bit : deny) >>> 0
  }
}

/** Sem nenhuma regra: dá para apagar do canal. */
export function isEmptyOverwrite(o: ChannelOverwrite | undefined): boolean {
  return !o || (o.allow === 0 && o.deny === 0)
}

export function findOverwrite(
  overwrites: ChannelOverwrite[] | undefined,
  target: OverwriteTargetRef
): ChannelOverwrite | undefined {
  return (overwrites ?? []).find((o) => o.target_type === target.type && o.target_id === target.id)
}

/** O canal é privado: o @everyone não vê. */
export function isPrivateChannel(
  overwrites: ChannelOverwrite[] | undefined,
  everyoneId: string | undefined
): boolean {
  if (!everyoneId) return false
  const o = findOverwrite(overwrites, { type: 'role', id: everyoneId })
  return !!o && (o.deny & Perm.VIEW_CHANNEL) !== 0
}

/** Sobrescrita do @everyone para virar (ou deixar de ser) privado, mantendo o resto. */
export function privateOverwrite(
  overwrites: ChannelOverwrite[] | undefined,
  everyoneId: string,
  makePrivate: boolean
): ChannelOverwrite {
  return withTriState(
    findOverwrite(overwrites, { type: 'role', id: everyoneId }),
    { type: 'role', id: everyoneId },
    Perm.VIEW_CHANNEL,
    makePrivate ? 'deny' : 'inherit'
  )
}

export interface OverwriteRow {
  type: OverwriteTarget
  id: string
  name: string
  color: number | null
  /** Já tem regra salva neste canal. */
  hasRules?: boolean
}

/**
 * Quem tem regra no canal, com nome: o @everyone primeiro, depois os cargos
 * (do mais alto ao mais baixo) e por fim os membros por nome. Alvo que não
 * existe mais (cargo apagado) some.
 */
export function overwriteRows(
  overwrites: ChannelOverwrite[] | undefined,
  roles: Role[],
  memberName: (userId: string) => string | undefined
): OverwriteRow[] {
  const rows: OverwriteRow[] = []
  for (const o of overwrites ?? []) {
    if (o.target_type === 'role') {
      const role = roles.find((r) => r.id === o.target_id)
      if (role) rows.push({ type: 'role', id: role.id, name: role.name, color: role.color })
    } else {
      const name = memberName(o.target_id)
      if (name !== undefined) rows.push({ type: 'member', id: o.target_id, name, color: null })
    }
  }
  const position = (r: OverwriteRow): number =>
    r.type === 'role' ? (roles.find((x) => x.id === r.id)?.position ?? 0) : -1
  const isEveryone = (r: OverwriteRow): boolean =>
    r.type === 'role' && roles.find((x) => x.id === r.id)?.is_default === true
  return rows.sort((a, b) => {
    if (isEveryone(a) !== isEveryone(b)) return isEveryone(a) ? -1 : 1
    if ((a.type === 'role') !== (b.type === 'role')) return a.type === 'role' ? -1 : 1
    if (a.type === 'role') return position(b) - position(a)
    return a.name.localeCompare(b.name)
  })
}

/**
 * Alvos do editor: o @everyone primeiro, depois todos os cargos do servidor
 * (do mais alto ao mais baixo) e por fim os membros que têm regra no canal.
 * Cargo sem regra aparece igual, para dar para configurá-lo direto.
 */
export function targetRows(
  overwrites: ChannelOverwrite[] | undefined,
  roles: Role[],
  memberName: (userId: string) => string | undefined
): OverwriteRow[] {
  const roleRows: OverwriteRow[] = [...roles]
    .sort((a, b) => {
      if (a.is_default !== b.is_default) return a.is_default ? -1 : 1
      return b.position - a.position
    })
    .map((r) => ({
      type: 'role',
      id: r.id,
      name: r.name,
      color: r.color,
      hasRules: !!findOverwrite(overwrites, { type: 'role', id: r.id })
    }))
  const memberRows = overwriteRows(overwrites, roles, memberName)
    .filter((r) => r.type === 'member')
    .map((r) => ({ ...r, hasRules: true }))
  return [...roleRows, ...memberRows]
}
