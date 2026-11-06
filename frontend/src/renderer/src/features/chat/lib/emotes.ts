import type { Message, ReactionSummary } from '../api/messages'

export interface EmoteItem {
  emoji: string
  label: string
  keywords: string[]
}

export interface EmoteCategory {
  id: string
  name: string
  items: EmoteItem[]
}

export const QUICK_EMOTES = ['👍', '❤️', '😂', '🔥'] as const

export const EMOTE_CATEGORIES: EmoteCategory[] = [
  {
    id: 'frequent',
    name: 'Frequentes',
    items: [
      { emoji: '👍', label: 'Joinha', keywords: ['ok', 'sim', 'like', 'bom', 'joinha'] },
      { emoji: '❤️', label: 'Coração', keywords: ['amor', 'coracao', 'love', 'amei'] },
      { emoji: '😂', label: 'Rindo', keywords: ['kkk', 'risada', 'haha', 'lol', 'engraçado'] },
      { emoji: '🔥', label: 'Fogo', keywords: ['fogo', 'top', 'brabo', 'quente', 'fire'] },
      { emoji: '😮', label: 'Surpreso', keywords: ['uau', 'wow', 'chocado', 'oloko'] },
      { emoji: '😢', label: 'Triste', keywords: ['choro', 'triste', 'sad', 'lagrima'] },
      { emoji: '🎉', label: 'Festa', keywords: ['parabens', 'festa', 'comemorar', 'party'] },
      { emoji: '👀', label: 'Olhos', keywords: ['olhos', 'vendo', 'observando', 'curioso'] }
    ]
  },
  {
    id: 'faces',
    name: 'Rostos',
    items: [
      { emoji: '😀', label: 'Sorrindo', keywords: ['sorriso', 'feliz', 'alegre'] },
      { emoji: '🤣', label: 'Rolando de rir', keywords: [' gargalhada', 'kkk', 'rindo'] },
      { emoji: '😊', label: 'Corado', keywords: ['fofo', 'timido', 'sorriso'] },
      { emoji: '😎', label: 'De óculos', keywords: ['legal', 'estilo', 'cool', 'chave'] },
      { emoji: '🤔', label: 'Pensando', keywords: ['pensando', 'duvida', 'hmm'] },
      { emoji: '😴', label: 'Dormindo', keywords: ['sono', 'cansado', 'zzz'] },
      { emoji: '🥳', label: 'Comemorando', keywords: ['festa', 'aniversario', 'feliz'] },
      { emoji: '🤯', label: 'Mente explodindo', keywords: ['mente', 'boom', 'chocado'] },
      { emoji: '😡', label: 'Bravo', keywords: ['raiva', 'bravo', 'puto', 'angry'] },
      { emoji: '🤡', label: 'Palhaço', keywords: ['palhaco', 'trouxa', 'clown'] },
      { emoji: '💀', label: 'Caveira', keywords: ['morri', 'caveira', 'skull'] },
      { emoji: '🫡', label: 'Continência', keywords: ['respeito', 'sim senhor', 'salute'] }
    ]
  },
  {
    id: 'gestures',
    name: 'Gestos',
    items: [
      { emoji: '👎', label: 'Não curti', keywords: ['nao', 'ruim', 'dislike'] },
      { emoji: '👏', label: 'Palmas', keywords: ['aplausos', 'palmas', 'parabens', 'brabo'] },
      { emoji: '🙏', label: 'Obrigado / Por favor', keywords: ['obrigado', 'amem', 'por favor', 'fe'] },
      { emoji: '🤝', label: 'Aperto de mão', keywords: ['fechado', 'acordo', 'parceria'] },
      { emoji: '✌️', label: 'Paz', keywords: ['paz', 'vitoria', 'dois'] },
      { emoji: '💪', label: 'Força', keywords: ['forca', 'forte', 'musculo'] },
      { emoji: '🙌', label: 'Mãos para cima', keywords: ['viva', 'aleluia', 'comemorar'] },
      { emoji: '🫶', label: 'Coração com as mãos', keywords: ['amor', 'carinho', 'coracao'] }
    ]
  },
  {
    id: 'symbols',
    name: 'Símbolos & Objetos',
    items: [
      { emoji: '💯', label: '100%', keywords: ['cem', '100', 'perfeito', 'total'] },
      { emoji: '✅', label: 'Confirmado', keywords: ['check', 'certo', 'pronto', 'feito'] },
      { emoji: '❌', label: 'Errado', keywords: ['x', 'erro', 'cancelar', 'nao'] },
      { emoji: '⚡', label: 'Raio', keywords: ['rapido', 'energia', 'raio'] },
      { emoji: '🚀', label: 'Foguete', keywords: ['foguete', 'voando', 'bora', 'deploy'] },
      { emoji: '🎮', label: 'Videogame', keywords: ['jogo', 'game', 'jogar', 'play'] },
      { emoji: '🎧', label: 'Fone', keywords: ['musica', 'call', 'som', 'audio'] },
      { emoji: '🏆', label: 'Troféu', keywords: ['campeao', 'vitoria', 'ganhou', 'trofeu'] }
    ]
  }
]

export function hasUserReacted(reactions: ReactionSummary[] | undefined, emoji: string, userId: string): boolean {
  if (!reactions || !userId) return false
  const found = reactions.find((r) => r.emoji === emoji)
  return Boolean(found && found.user_ids.includes(userId))
}

export function applyReactionAdd(
  reactions: ReactionSummary[] | undefined,
  emoji: string,
  userId: string
): ReactionSummary[] {
  const current = reactions ?? []
  const idx = current.findIndex((r) => r.emoji === emoji)
  if (idx === -1) {
    return [...current, { emoji, count: 1, user_ids: [userId] }]
  }
  const existing = current[idx]
  if (existing.user_ids.includes(userId)) {
    return current
  }
  const nextUserIds = [...existing.user_ids, userId]
  const next = [...current]
  next[idx] = {
    ...existing,
    count: nextUserIds.length,
    user_ids: nextUserIds
  }
  return next
}

export function applyReactionRemove(
  reactions: ReactionSummary[] | undefined,
  emoji: string,
  userId: string
): ReactionSummary[] {
  const current = reactions ?? []
  const idx = current.findIndex((r) => r.emoji === emoji)
  if (idx === -1) return current

  const existing = current[idx]
  if (!existing.user_ids.includes(userId)) return current

  const nextUserIds = existing.user_ids.filter((id) => id !== userId)
  if (nextUserIds.length === 0) {
    return current.filter((_, i) => i !== idx)
  }

  const next = [...current]
  next[idx] = {
    ...existing,
    count: nextUserIds.length,
    user_ids: nextUserIds
  }
  return next
}

export function clearDeletedReplyTarget(messages: Message[], deletedMessageId: string): Message[] {
  let changed = false
  const next = messages.map((m) => {
    if (m.reply_to_id === deletedMessageId || m.reply_to?.id === deletedMessageId) {
      changed = true
      return {
        ...m,
        reply_to_id: null,
        reply_to: null
      }
    }
    return m
  })
  return changed ? next : messages
}
