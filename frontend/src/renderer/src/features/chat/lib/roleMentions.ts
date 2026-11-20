import type { RoleMention } from '../api/messages'
import { stripCode } from './markdown/stripCode'
import { opensToken, tokenEndsAt } from './mentionToken'
import { roleColorCss } from '../../servers/lib/permissions'

// Menção de cargo num canal de servidor (ADR 0065). O texto guarda "@handle"
// (o nome do cargo em minúsculas, com "-" no lugar dos espaços) e o app manda
// junto os ids dos cargos escolhidos; quem decide se pinga é o backend, no
// campo mention_roles da mensagem. Mesma regra de internal/message/mention_role.go:
// os casos de testdata/role_mentions.json rodam nos dois lados.

/** O que a menção precisa saber de um cargo do servidor. */
export interface MentionableRole {
  id: string
  name: string
  color: number | null
  position: number
  /** Qualquer pessoa pode mencionar (senão, só quem tem a permissão). */
  mentionable?: boolean
  is_default: boolean
  is_system?: boolean
}

/** Item do autocompletar: `username` é o handle, o que vai para o texto. */
export interface RoleSuggestion {
  kind: 'role'
  username: string
  id: string
  name: string
  color: number | null
}

/** Cargos escolhidos na lista do "@": handle -> id do cargo. */
export type RolePicks = Record<string, string>

export interface RolePart {
  text: string
  /** id do cargo, se este pedaço é uma menção de cargo */
  role?: string
}

/** @all, @here e @everyone são do canal: um cargo com esse nome não toma o lugar. */
const RESERVED_HANDLES = ['all', 'here', 'everyone']

const WORD_CHAR = /[\p{L}\p{Nd}_]/u

/**
 * Minúsculas do mesmo jeito que o backend (foldCase em mention_role.go): o
 * sigma final do grego ("ς") vira "σ". O toLowerCase escolhe entre os dois
 * pela posição e o Go não; sem isso o handle de um cargo grego nunca casaria.
 * O tamanho do texto não muda.
 */
const lowerFold = (text: string): string => text.toLowerCase().replace(/ς/g, 'σ')

/**
 * Como o cargo se escreve numa menção: minúsculas, espaços e "-" viram um "-"
 * só (nunca nas pontas) e o que não é letra, dígito ou "_" some. "" = o nome
 * não dá handle (só símbolos ou emoji).
 */
export function roleHandle(name: string): string {
  let out = ''
  let gap = false
  for (const ch of lowerFold(name)) {
    if (WORD_CHAR.test(ch)) {
      if (gap && out) out += '-'
      gap = false
      out += ch
    } else if (ch === '-' || /\s/.test(ch)) {
      gap = true
    }
  }
  return out
}

/** Onde "@handle" aparece como palavra inteira em `lower` (texto em minúsculas). */
function handleSpans(lower: string, handle: string): [number, number][] {
  const spans: [number, number][] = []
  if (!handle) return spans
  const needle = `@${handle}`
  for (let at = lower.indexOf(needle); at !== -1; at = lower.indexOf(needle, at + 1)) {
    const end = at + needle.length
    if (opensToken(lower, at) && tokenEndsAt(lower, end)) spans.push([at, end])
  }
  return spans
}

/** O texto tem "@handle" como palavra inteira, fora de código? */
export function mentionsHandle(content: string, handle: string): boolean {
  return handleSpans(lowerFold(stripCode(content)), handle).length > 0
}

interface Candidate {
  role: MentionableRole
  handle: string
}

/**
 * Cargos que a pessoa pode mencionar, do mais alto para o mais baixo: fora os
 * fixos (@everyone e Bots), os sem handle e os de nome reservado; cargo
 * fechado só entra para quem tem a permissão.
 */
function candidates(roles: MentionableRole[], canMentionAny: boolean): Candidate[] {
  return roles
    .filter((r) => !r.is_default && !r.is_system && (r.mentionable || canMentionAny))
    .map((role) => ({ role, handle: roleHandle(role.name) }))
    .filter((c) => c.handle && !RESERVED_HANDLES.includes(c.handle))
    .sort((a, b) => b.role.position - a.role.position)
}

/** Sem acento e em minúsculas, para a busca do autocompletar. */
const fold = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()

/** Cargos do autocompletar do "@": casa pelo começo do nome ou do handle. */
export function roleSuggestions(
  query: string,
  roles: MentionableRole[],
  canMentionAny: boolean,
  max = 6
): RoleSuggestion[] {
  const q = fold(query)
  return candidates(roles, canMentionAny)
    .filter((c) => fold(c.role.name).startsWith(q) || fold(c.handle).startsWith(q))
    .slice(0, max)
    .map(({ role, handle }) => ({
      kind: 'role',
      username: handle,
      id: role.id,
      name: role.name,
      color: role.color
    }))
}

/**
 * Ids dos cargos que vão com a mensagem (mention_role_ids). Para cada
 * "@handle" do texto: o cargo escolhido na lista; sem escolha, o cargo mais
 * alto com aquele handle, a não ser que um membro tenha esse nick (aí é a
 * pessoa). Um handle tem um significado só por mensagem.
 */
export function roleIdsToSend(
  text: string,
  picks: RolePicks,
  roles: MentionableRole[],
  usernames: string[],
  canMentionAny: boolean
): string[] {
  const people = new Set(usernames.map((u) => u.toLowerCase()))
  const all = candidates(roles, canMentionAny)
  const ids: string[] = []
  const seen = new Set<string>()
  for (const { role, handle } of all) {
    if (seen.has(handle)) continue
    seen.add(handle)
    if (!mentionsHandle(text, handle)) continue
    const picked = all.find((c) => c.handle === handle && c.role.id === picks[handle])
    if (picked) ids.push(picked.role.id)
    else if (!people.has(handle)) ids.push(role.id)
  }
  return ids
}

/**
 * As escolhas depois de pegar um item na lista do "@": o cargo fica guardado
 * pelo handle; pegar a pessoa de mesmo nick desfaz a escolha do cargo (o
 * mesmo "@handle" passa a ser ela).
 */
export function withRolePick(
  picks: RolePicks,
  item: { kind: 'user' | 'everyone' | 'role'; username: string; id?: string }
): RolePicks {
  if (item.kind === 'role' && item.id) return { ...picks, [item.username]: item.id }
  const handle = item.username.toLowerCase()
  if (item.kind !== 'user' || !(handle in picks)) return picks
  const next = { ...picks }
  delete next[handle]
  return next
}

/**
 * Só as escolhas cujo "@handle" ainda está no texto. Apagar um pedaço do
 * handle desfaz a escolha: redigitar à mão depois não é escolher o cargo.
 * Sem nada a tirar, devolve o mesmo objeto.
 */
export function picksInText(picks: RolePicks, text: string): RolePicks {
  const kept = Object.entries(picks).filter(([handle]) => mentionsHandle(text, handle))
  return kept.length === Object.keys(picks).length ? picks : Object.fromEntries(kept)
}

/**
 * O que o chip do cargo mostra: o nome e a cor de agora. Cargo apagado (ou de
 * um servidor cujos cargos o app não conhece) fica com o texto como foi escrito.
 */
export function roleChipView(
  role: { name: string; color: number | null } | undefined,
  text: string
): { label: string; color: string | undefined } {
  return role ? { label: `@${role.name}`, color: roleColorCss(role.color) } : { label: text, color: undefined }
}

/** Os trechos "@handle" dos cargos pingados, em ordem e sem sobrepor. */
function pingedSpans(content: string, roles: readonly RoleMention[]): [number, number, string][] {
  const lower = lowerFold(content)
  // Minúscula que muda de tamanho desalinharia os índices: fica como texto.
  if (lower.length !== content.length) return []
  const spans = roles.flatMap((r) =>
    handleSpans(lower, r.handle).map(([start, end]): [number, number, string] => [start, end, r.id])
  )
  spans.sort((a, b) => a[0] - b[0])
  return spans.filter((span, i) => i === 0 || span[0] >= spans[i - 1][1])
}

/**
 * Quebra o texto nos "@handle" dos cargos que a mensagem pingou
 * (mention_roles) e no resto. O handle gravado na mensagem acha o trecho
 * mesmo depois de o cargo mudar de nome.
 */
export function splitRoleMentions(content: string, roles: readonly RoleMention[]): RolePart[] {
  const parts: RolePart[] = []
  let last = 0
  for (const [start, end, id] of pingedSpans(content, roles)) {
    if (start > last) parts.push({ text: content.slice(last, start) })
    parts.push({ text: content.slice(start, end), role: id })
    last = end
  }
  if (last < content.length || parts.length === 0) parts.push({ text: content.slice(last) })
  return parts
}

/**
 * O texto sem os "@handle" dos cargos pingados (cada um vira um espaço): ali
 * é o cargo, não a pessoa de mesmo nick.
 */
export function withoutRoleMentions(
  content: string,
  roles: readonly RoleMention[] | null | undefined
): string {
  if (!roles?.length) return content
  return splitRoleMentions(content, roles)
    .map((p) => (p.role ? ' ' : p.text))
    .join('')
}
