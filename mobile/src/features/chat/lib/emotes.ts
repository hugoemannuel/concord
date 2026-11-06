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

export function filterEmoteCategories(query: string): EmoteCategory[] {
  const q = query.trim().toLowerCase()
  if (!q) return EMOTE_CATEGORIES

  return EMOTE_CATEGORIES.map((cat) => ({
    ...cat,
    items: cat.items.filter(
      (item) =>
        item.emoji.includes(q) ||
        item.label.toLowerCase().includes(q) ||
        item.keywords.some((k) => k.toLowerCase().includes(q))
    )
  })).filter((cat) => cat.items.length > 0)
}
