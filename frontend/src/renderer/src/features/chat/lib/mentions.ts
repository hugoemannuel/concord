import type { Message, MentionEveryone, RoleMention } from '../api/messages'
import type { ChosenStatus } from '../../friends/lib/presenceStatus'
import { serverDisplayName } from '../../servers/lib/serverNames'
import { stripCode } from './markdown/stripCode'
import { OPENER, tokenEndsAt } from './mentionToken'
import {
  roleSuggestions,
  splitRoleMentions,
  withoutRoleMentions,
  type MentionableRole,
  type RoleSuggestion
} from './roleMentions'

// Menções @nick no chat de texto, mais @all/@here (menção em massa num canal
// de servidor) e @cargo (lib/roleMentions.ts). Quem decide se @all/@here e o
// cargo pingam é o backend, nos campos mention_everyone e mention_roles da
// mensagem; o texto sozinho não pinga ninguém.

const NICK = '[A-Za-z0-9_.]+'

/** Nomes que nunca são menção pessoal: @all/@here só valem pelo mention_everyone. */
const RESERVED = ['all', 'here', 'everyone']

function isReserved(nick: string): boolean {
  return RESERVED.includes(nick.toLowerCase())
}

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * A mensagem menciona este @nick (sem diferenciar maiúsculas)? Quem se chama
 * all/here/everyone nunca é pingado pelo texto. Menção dentro de código
 * (`trecho` ou bloco ```) não conta, como no Discord.
 */
export function mentionsUser(message: string, username: string): boolean {
  if (!username || isReserved(username)) return false
  const content = stripCode(message)
  const re = new RegExp(`${OPENER}@${escape(username)}`, 'gi')
  for (let match = re.exec(content); match; match = re.exec(content)) {
    if (tokenEndsAt(content, match.index + match[0].length)) return true
    re.lastIndex = match.index + match[1].length + 1
  }
  return false
}

export interface MessagePart {
  text: string
  /** nick mencionado, se este pedaço é uma menção */
  mention?: string
  /** id do cargo, se este pedaço é uma menção de cargo */
  role?: string
}

const NO_ROLES: readonly RoleMention[] = []
const NO_ROLE_IDS: readonly string[] = []

const EVERYONE: readonly MentionEveryone[] = ['all', 'here']

function isEveryone(nick: string): nick is MentionEveryone {
  return (EVERYONE as readonly string[]).includes(nick)
}

/** "@everyone" é outro jeito de escrever "@all" (quem vem do Discord). */
const EVERYONE_ALIAS = 'everyone'

const canonicalEveryone = (lower: string): string => (lower === EVERYONE_ALIAS ? 'all' : lower)

/**
 * Quebra o texto em pedaços normais e menções, para destacar. @all/@here só
 * viram menção quando batem com o mention_everyone da mensagem, e o @cargo
 * só quando está no mention_roles; senão ficam como texto puro.
 */
export function splitMentions(
  content: string,
  everyone: MentionEveryone | null = null,
  roles: readonly RoleMention[] = NO_ROLES
): MessagePart[] {
  if (roles.length === 0) return splitPeople(content, everyone)
  return splitRoleMentions(content, roles).flatMap((p) =>
    p.role ? [p] : splitPeople(p.text, everyone)
  )
}

/** As menções de pessoa e o @all/@here de um trecho sem menção de cargo. */
function splitPeople(content: string, everyone: MentionEveryone | null): MessagePart[] {
  const parts: MessagePart[] = []
  const pushText = (text: string): void => {
    const prev = parts[parts.length - 1]
    if (prev && !prev.mention) prev.text += text
    else parts.push({ text })
  }
  const re = new RegExp(`${OPENER}@(${NICK})`, 'g')
  let last = 0
  for (let match = re.exec(content); match; match = re.exec(content)) {
    const start = match.index + match[1].length
    // não engole o ponto final ("@ana.")
    const nick = match[2].replace(/\.+$/, '')
    const lower = canonicalEveryone(nick.toLowerCase())
    if (start > last) pushText(content.slice(last, start))
    if (!tokenEndsAt(content, start + 1 + nick.length)) {
      // "@all-hands", "@ana's": parte de uma palavra, não menção.
      pushText(`@${nick}`)
    } else if (isEveryone(lower) && lower === everyone) {
      parts.push({ text: `@${nick}`, mention: lower })
    } else if (isReserved(nick)) {
      pushText(`@${nick}`)
    } else {
      parts.push({ text: `@${nick}`, mention: nick })
    }
    last = start + 1 + nick.length
    re.lastIndex = last
  }
  if (last < content.length) pushText(content.slice(last))
  return parts.length ? parts : [{ text: content }]
}

/**
 * Um @all/@here (já liberado pelo backend) pinga quem tem este status? @all
 * pinga todo mundo; @here só quem aparece online — ausente e invisível
 * (que os outros veem offline) ficam de fora. Sem status conhecido, estar
 * conectado já é estar online.
 */
export function everyonePingsMe(
  everyone: MentionEveryone | null | undefined,
  status: ChosenStatus | undefined
): boolean {
  if (everyone === 'all') return true
  if (everyone === 'here') return status !== 'idle' && status !== 'invisible'
  return false
}

/**
 * A linha da mensagem ganha o destaque de "mencionou você"? @nick, resposta a
 * uma mensagem sua ou @all/@here liberados. No histórico não dá para saber o
 * status de quando a mensagem chegou, então @here destaca para todos.
 */
/**
 * O texto da mensagem cita @username? Na encaminhada não: quem a original
 * citava não é avisado de novo (o backend também não pinga).
 */
export function textMentionsUser(
  message: Pick<Message, 'content' | 'forwarded_from' | 'mention_roles'>,
  username: string
): boolean {
  if (message.forwarded_from) return false
  // O "@handle" de um cargo pingado é o cargo, não a pessoa de mesmo nick.
  return mentionsUser(withoutRoleMentions(message.content, message.mention_roles), username)
}

/** A mensagem pingou (pelo backend, em mention_roles) algum dos meus cargos? */
export function rolePingsMe(
  roles: readonly RoleMention[] | null | undefined,
  myRoleIds: readonly string[]
): boolean {
  return Boolean(roles?.some((r) => myRoleIds.includes(r.id)))
}

/**
 * `myRoleIds`: os meus cargos no servidor da mensagem (myRolesStore); sem
 * eles, menção de cargo não destaca.
 */
export function messageMentionsMe(
  message: Pick<
    Message,
    'author_id' | 'content' | 'mention_everyone' | 'forwarded_from' | 'mention_roles'
  > & {
    reply_to?: { author_id: string } | null
  },
  me: { id: string; username: string } | null | undefined,
  myRoleIds: readonly string[] = NO_ROLE_IDS
): boolean {
  if (!me || message.author_id === me.id) return false
  return (
    textMentionsUser(message, me.username) ||
    message.reply_to?.author_id === me.id ||
    Boolean(message.mention_everyone) ||
    rolePingsMe(message.mention_roles, myRoleIds)
  )
}

export interface EveryoneSuggestion {
  /** O que vai para o texto: "everyone" vale como "all". */
  username: MentionEveryone | typeof EVERYONE_ALIAS
  description: string
}

const EVERYONE_SUGGESTIONS: EveryoneSuggestion[] = [
  { username: 'all', description: 'Notifica todos do canal' },
  { username: 'here', description: 'Notifica quem está online' },
  { username: EVERYONE_ALIAS, description: 'Notifica todos do canal' }
]

/**
 * Sugestões de @all/@here no autocompletar — só para dono e moderadores.
 * @everyone só entra quando o que foi digitado começa com "e": com só "@" a
 * lista não ganha um item igual ao @all.
 */
export function everyoneSuggestions(query: string, allowed: boolean): EveryoneSuggestion[] {
  if (!allowed) return []
  const q = query.toLowerCase()
  return EVERYONE_SUGGESTIONS.filter(
    (s) => s.username.startsWith(q) && (q !== '' || s.username !== EVERYONE_ALIAS)
  )
}

/** O "@xx" em digitação: nick, ou handle de cargo (letra com acento e "-"). */
const MENTION_QUERY = /(^|\s)@([\p{L}\p{N}_.-]+)?$/u

/** "@xx" sendo digitado logo antes do cursor → o que buscar e onde começa. */
export function mentionQuery(
  draft: string,
  caret: number
): { query: string; start: number } | null {
  const before = draft.slice(0, caret)
  const match = MENTION_QUERY.exec(before)
  if (!match) return null
  return { query: match[2] ?? '', start: match.index + match[1].length }
}

/** Troca o "@xx" digitado por "@nick " e devolve a nova posição do cursor. */
export function applyMention(
  draft: string,
  start: number,
  caret: number,
  username: string
): { text: string; caret: number } {
  const insert = `@${username} `
  return { text: draft.slice(0, start) + insert + draft.slice(caret), caret: start + insert.length }
}

export interface UserSuggestionInput {
  username: string
  display_name: string
  /** Apelido no servidor (só em canal de servidor). */
  nickname?: string | null
}

/** Item do autocompletar: alguém do canal, @all/@here ou um cargo. */
export type MentionSuggestion =
  | { kind: 'user'; username: string; display_name: string; nickname?: string | null }
  | ({ kind: 'everyone' } & EveryoneSuggestion)
  | RoleSuggestion

/**
 * Monta o autocompletar do "@". Casa pelo apelido no servidor, pelo nick ou
 * pelo nome; escolher sempre escreve o @nick. @all/@here (só para quem pode)
 * aparecem no topo quando o que foi digitado bate com eles ("@a", "@h"), ou
 * com só "@" se ninguém mais bate. O item padrão (Tab/Enter) é sempre uma
 * pessoa quando há alguma, para nunca marcar @all sem querer; com só "@" e
 * nenhuma pessoa, não há padrão (-1). Os cargos que a pessoa pode mencionar
 * (`roles`) vêm depois das pessoas, pela mesma regra do @all/@here.
 */
export function mentionSuggestions(
  query: string,
  users: UserSuggestionInput[],
  canMentionEveryone: boolean,
  { exclude, max = 6, roles = [] }: { exclude?: string; max?: number; roles?: MentionableRole[] } = {}
): { items: MentionSuggestion[]; defaultIndex: number } {
  const q = query.toLowerCase()
  const people: MentionSuggestion[] = users
    .filter((u) => u.username !== exclude && !isReserved(u.username))
    .filter((u) =>
      [u.nickname, u.username, u.display_name].some((v) => v && v.toLowerCase().startsWith(q))
    )
    .slice(0, max)
    .map((u) => ({
      kind: 'user',
      username: u.username,
      display_name: u.display_name,
      nickname: u.nickname
    }))
  const showGroups = Boolean(q) || people.length === 0
  const everyone: MentionSuggestion[] = showGroups
    ? everyoneSuggestions(q, canMentionEveryone).map((e) => ({ kind: 'everyone', ...e }))
    : []
  const roleItems: MentionSuggestion[] = showGroups
    ? roleSuggestions(query, roles, canMentionEveryone, max)
    : []
  const items = [...everyone, ...people, ...roleItems]
  const defaultIndex = people.length > 0 ? everyone.length : q && items.length > 0 ? 0 : -1
  return { items, defaultIndex }
}

/** @nick (minúsculo, sem o "@") -> nome para mostrar no chip da menção. */
export type MentionLabels = Record<string, string>

/**
 * Nome que o chip da menção mostra. O texto da mensagem continua "@nick";
 * na tela vale o apelido no servidor, senão o nome de exibição (em DM e
 * grupo, o nome de exibição). Só o nick sobra quando nada disso existe.
 */
export function mentionLabels(
  people: { username: string; display_name?: string | null; nickname?: string | null }[]
): MentionLabels {
  const labels: MentionLabels = {}
  for (const p of people) {
    if (!p.username || isReserved(p.username)) continue
    const key = p.username.toLowerCase()
    // Primeira ocorrência manda (a lista de quem está no chat vem antes).
    if (key in labels) continue
    labels[key] = serverDisplayName({ nickname: p.nickname }, p)
  }
  return labels
}

/** Texto do chip: "@Nome" se o nick é conhecido; senão o "@nick" como veio. */
export function mentionChipText(part: MessagePart, labels: MentionLabels | undefined): string {
  if (!part.mention || !labels) return part.text
  const name = labels[part.mention.toLowerCase()]
  return name ? `@${name}` : part.text
}

/** Mesmos nomes? Deixa o MessageText memoizado não redesenhar à toa. */
export function sameLabels(a: MentionLabels | undefined, b: MentionLabels | undefined): boolean {
  if (a === b) return true
  if (!a || !b) return false
  const keys = Object.keys(a)
  if (keys.length !== Object.keys(b).length) return false
  return keys.every((k) => a[k] === b[k])
}

/**
 * Os nomes novos, ou o objeto anterior se nada mudou: a lista de mensagens recebe
 * a mesma referência e as linhas memoizadas não redesenham a cada mensagem.
 */
export function keepSameLabels(prev: MentionLabels | undefined, next: MentionLabels): MentionLabels {
  return prev && sameLabels(prev, next) ? prev : next
}
