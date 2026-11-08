import type { CreatePollInput, Message, Poll } from '../api/messages'
import { attachmentPreview } from './attachments'
import { markdownPreview, textPreview, type Preview } from './preview'
import { previewToText } from './previewEmoji'

// Limites iguais aos do backend (e do Discord).
export const POLL_QUESTION_MAX = 300
export const POLL_ANSWER_MAX = 55
export const POLL_MIN_ANSWERS = 2
export const POLL_MAX_ANSWERS = 10

export const POLL_DURATIONS: { hours: number; label: string }[] = [
  { hours: 1, label: '1 hora' },
  { hours: 4, label: '4 horas' },
  { hours: 8, label: '8 horas' },
  { hours: 24, label: '24 horas' },
  { hours: 72, label: '3 dias' },
  { hours: 168, label: '1 semana' },
  { hours: 336, label: '2 semanas' }
]

/** Emojis oferecidos no seletor de cada resposta. */
// design-allow: emojis que a pessoa escolhe para a resposta (conteúdo, não ícone)
export const POLL_EMOJIS = '👍 👎 ❤️ 😂 😮 😢 🔥 🎉 ✅ ❌ ⭐ 💡 🍕 🍔 🍣 ☕ 🎮 🎬 🎵 ⚽ 🏀 📚 💻 🐶 🐱 🌙 ☀️ 🌧️ 🚀 💰 🤔 👀'.split(' ')

/** Enquete sem votos novos: encerrada pelo autor ou com o prazo vencido. */
export function isPollClosed(poll: Poll, now: number = Date.now()): boolean {
  return Boolean(poll.ended_at) || now >= new Date(poll.expires_at).getTime()
}

export function pollPercent(count: number, total: number): number {
  return total > 0 ? Math.round((count / total) * 100) : 0
}

/** Respostas mais votadas (destacadas quando a enquete acaba). */
export function pollWinners(poll: Poll): number[] {
  const max = Math.max(0, ...poll.answers.map((a) => a.count))
  if (max === 0) return []
  return poll.answers.filter((a) => a.count === max).map((a) => a.answer_id)
}

/** "Faltam 3 dias", "Faltam 5 h", "Faltam 12 min" ou "Encerrada". */
export function pollTimeLeft(poll: Poll, now: number = Date.now()): string {
  if (isPollClosed(poll, now)) return 'Encerrada'
  const minutes = Math.ceil((new Date(poll.expires_at).getTime() - now) / 60_000)
  if (minutes < 60) return `Faltam ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `Faltam ${hours} h`
  const days = Math.floor(hours / 24)
  return `Faltam ${days} ${days === 1 ? 'dia' : 'dias'}`
}

/** "1 voto", "3 votos". */
export function votesLabel(count: number): string {
  return `${count} ${count === 1 ? 'voto' : 'votos'}`
}

/** Linha de ajuda abaixo da pergunta. */
export function pollHint(closed: boolean, multiselect: boolean): string {
  if (closed) return 'Enquete encerrada'
  return multiselect ? 'Selecione uma ou mais respostas' : 'Selecione uma resposta'
}

export interface PollUpdate {
  poll: Poll
  voter_id?: string
  voter_answer_ids?: number[] | null
}

/**
 * Aplica um `message:poll:update` à enquete local: as contagens vêm do evento,
 * e o "me_voted" só muda quando quem votou foi você (o evento é o mesmo para
 * todos da sala).
 */
export function applyPollUpdate(
  current: Poll | null | undefined,
  update: PollUpdate,
  meId: string | null
): Poll {
  const mine =
    update.voter_id && update.voter_id === meId ? new Set(update.voter_answer_ids ?? []) : null
  const previous = new Map((current?.answers ?? []).map((a) => [a.answer_id, a.me_voted]))
  return {
    ...update.poll,
    answers: update.poll.answers.map((a) => ({
      ...a,
      me_voted: mine ? mine.has(a.answer_id) : (previous.get(a.answer_id) ?? false)
    }))
  }
}

type PreviewSource = Pick<
  Message,
  'content' | 'poll' | 'attachments' | 'sticker' | 'sticker_id' | 'deleted_sticker_name' | 'gif_url'
>

/** Prévia da mensagem dentro do app (barra de resposta, busca): texto e tipo. */
export function messagePreviewParts(message: PreviewSource): Preview {
  if (message.poll) return { icon: 'poll', text: message.poll.question }
  if (message.content) return markdownPreview(message.content)
  if (message.sticker) return { icon: 'sticker', text: `Figurinha :${message.sticker.name}:` }
  if (message.sticker_id) return { icon: 'sticker', text: 'Figurinha' }
  if (message.deleted_sticker_name) return { icon: 'sticker', text: `Figurinha :${message.deleted_sticker_name}:` }
  if (message.gif_url) return { icon: 'gif', text: 'GIF' }
  return attachmentPreview(message.attachments) ?? textPreview('')
}

/** A mesma prévia em texto puro (notificação do SO, última mensagem da conversa). */
export function messagePreview(message: PreviewSource): string {
  return previewToText(messagePreviewParts(message))
}

export interface PollDraftAnswer {
  text: string
  emoji: string
  image_url: string
}

export interface PollDraft {
  question: string
  answers: PollDraftAnswer[]
  duration_hours: number
  allow_multiselect: boolean
}

/** Valida o rascunho do modal; devolve a mensagem de erro ou null. */
export function pollDraftError(draft: PollDraft): string | null {
  if (!draft.question.trim()) return 'Escreva a pergunta.'
  const filled = draft.answers.filter((a) => a.text.trim())
  if (filled.length < POLL_MIN_ANSWERS) return 'Preencha pelo menos duas respostas.'
  const image = filled.find((a) => a.image_url.trim() && !a.image_url.trim().startsWith('https://'))
  if (image) return 'A imagem da resposta precisa ser um link https://.'
  return null
}

/** Monta o corpo da requisição a partir do rascunho (ignora respostas vazias). */
export function pollDraftToInput(draft: PollDraft): CreatePollInput {
  return {
    question: draft.question.trim(),
    answers: draft.answers
      .filter((a) => a.text.trim())
      .map((a) => ({
        text: a.text.trim(),
        ...(a.emoji ? { emoji: a.emoji } : {}),
        ...(!a.emoji && a.image_url.trim() ? { image_url: a.image_url.trim() } : {})
      })),
    duration_hours: draft.duration_hours,
    allow_multiselect: draft.allow_multiselect
  }
}
