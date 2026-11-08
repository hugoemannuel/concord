/**
 * O que a tela do chat (ChatPane) mostra, derivado do estado: aviso no lugar
 * do campo, menu de menções, nomes, prévia da fixada e rótulos do campo.
 */
import type { Message, PinnedMessage } from '../api/messages'
import { serverDisplayName } from '../../servers/lib/serverNames'
import { sendDeniedReason, type ChatPermissions } from './chatPermissions'
import { mentionSuggestions, type MentionSuggestion, type UserSuggestionInput } from './mentions'
import type { User } from '../../auth/store/authStore'
import { MUSIC_COMMANDS, type SlashSuggestion } from '../../music/lib/music'
import { TTS_SUGGESTION } from '../../tts/lib/ttsCommand'
import { markdownPreview, textPreview, type Preview } from './preview'

/** Id do canal de uma sala `channel:<id>`; DM e grupo não têm (null). */
export function channelIdOf(room: string): string | null {
  return room.startsWith('channel:') ? room.slice('channel:'.length) : null
}

/** Aviso no lugar do campo: o da tela (ex.: DM bloqueada) ou, sem SEND_MESSAGES, o de permissão. */
export function composerDisabledReason(
  explicit: string | undefined,
  permissions: ChatPermissions
): string | undefined {
  return explicit ?? sendDeniedReason(permissions)
}

/**
 * Campo de um estado guardado por sala (edição, resposta): o ServerView
 * reaproveita o ChatPane entre canais, então o de outra sala não vale aqui.
 */
export function inRoom<S extends { room: string }, K extends keyof S>(
  state: S | null,
  room: string,
  key: K
): S[K] | null {
  return state?.room === room ? state[key] : null
}

/**
 * Sugestões do @ em digitação e o item destacado. Tab/Enter pegam o item
 * padrão (sempre uma pessoa, se houver) até a pessoa navegar com as setas.
 */
export function mentionMenu(
  mention: { query: string; start: number } | null,
  highlightChoice: number | null,
  users: UserSuggestionInput[],
  canMentionEveryone: boolean,
  exclude: string | undefined,
  max: number
): { suggestions: MentionSuggestion[]; highlight: number } {
  if (!mention) return { suggestions: [], highlight: -1 }
  const { items, defaultIndex } = mentionSuggestions(mention.query, users, canMentionEveryone, {
    exclude,
    max
  })
  return { suggestions: items, highlight: highlightChoice ?? defaultIndex }
}

/** Nome do autor da mensagem: em servidor, o apelido de lá; senão, o nome de exibição. */
export function messageAuthorName(
  message: Pick<Message, 'author_id' | 'author'> | null | undefined,
  nicknames: Record<string, string> | undefined
): string {
  const nickname = message ? nicknames?.[message.author_id] : undefined
  return serverDisplayName({ nickname }, message?.author)
}

const ATTACHMENT_PREVIEW: Record<string, Preview> = {
  image: { icon: 'image', text: 'Imagem' },
  video: { icon: 'video', text: 'Vídeo' },
  audio: { icon: 'audio', text: 'Áudio' }
}

function pinAttachmentPreview(pin: PinnedMessage): Preview | null {
  const first = pin.attachments?.[0]
  if (!first) return null
  return ATTACHMENT_PREVIEW[first.kind] ?? { icon: 'attachment', text: 'Anexo' }
}

function richPreview(pin: PinnedMessage): Preview | null {
  if (pin.sticker) return { icon: 'sticker', text: `Figurinha :${pin.sticker.name}:` }
  return pin.gif_url ? { icon: 'gif', text: 'GIF' } : null
}

function contentPreview(pin: PinnedMessage): Preview | null {
  const text = pin.content?.trim()
  return text ? markdownPreview(text) : null
}

/** Prévia da mensagem fixada na barra do topo do canal. */
export function pinnedPreview(pin: PinnedMessage): Preview {
  return (
    richPreview(pin) ??
    contentPreview(pin) ??
    pinAttachmentPreview(pin) ??
    (pin.poll
      ? { icon: 'poll', text: 'Enquete: ' + pin.poll.question }
      : textPreview('Mensagem fixada'))
  )
}

/** "+N fixada(s)" ao lado da mais recente; null quando ela é a única. */
export function morePinsLabel(count: number): string | null {
  const others = count - 1
  if (others < 1) return null
  return `+${others} fixada${others > 1 ? 's' : ''}`
}

/** Texto do campo vazio: respondendo, chama a pessoa; senão, o da tela. */
export function composerPlaceholder(replying: boolean, author: string, fallback: string): string {
  return replying ? `Responder a @${author}…` : fallback
}

/**
 * Pedido de pulo da busca: a mensagem a buscar quando o pedido é desta sala
 * e ela já carregou; null enquanto não.
 */
export function readyJump(
  pending: { room: string; messageId: string } | null,
  room: string,
  loading: boolean
): string | null {
  if (!pending || loading) return null
  return pending.room === room ? pending.messageId : null
}

/** Mensagem pedida pelo evento `concord:jump-to-message` (null: sem mensagem). */
export function jumpEventTarget(e: Event): string | null {
  return (e as CustomEvent<{ messageId?: string } | null>).detail?.messageId || null
}

/** Rótulo do botão de enviar. */
export function submitLabel(uploading: boolean, sending: boolean): string {
  if (uploading) return 'Enviando arquivos…'
  return sending ? 'Enviando…' : 'Enviar'
}

/** Comandos do "/" no campo: Maestro só em canal de servidor; /tts com a permissão. */
export function composerCommands(isChannel: boolean, canSendTTS: boolean): SlashSuggestion[] {
  return [...(isChannel ? MUSIC_COMMANDS : []), ...(canSendTTS ? [TTS_SUGGESTION] : [])]
}

type Nicknames = Record<string, string> | undefined
type Person = { username: string; display_name: string; nickname?: string | null }

function mePerson(me: Pick<User, 'id' | 'username' | 'display_name'> | null, nicknames: Nicknames): Person[] {
  return me ? [{ username: me.username, display_name: me.display_name, nickname: nicknames?.[me.id] }] : []
}

function authorPeople(messages: Message[], nicknames: Nicknames): Person[] {
  return messages.flatMap((m) => (m.author ? [{ ...m.author, nickname: nicknames?.[m.author_id] }] : []))
}

/**
 * Quem os chips de menção sabem nomear: quem está no chat, eu e os autores da
 * lista (que podem ter saído do servidor). Em servidor vale o apelido; em DM, o nome.
 */
export function mentionPeople(
  mentionable: Person[],
  me: Pick<User, 'id' | 'username' | 'display_name'> | null,
  messages: Message[],
  nicknames: Nicknames
): Person[] {
  return [...mentionable, ...mePerson(me, nicknames), ...authorPeople(messages, nicknames)]
}
