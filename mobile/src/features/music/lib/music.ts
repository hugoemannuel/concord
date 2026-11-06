import type { MusicItem } from '../api/music'

export const MAESTRO_NAME = 'Maestro'

/** O Maestro entra na sala de mídia com a identidade `bot-music:<canal>` (bot.Identity no backend). */
export const isMaestroIdentity = (id: string): boolean => id.startsWith('bot-music:')

/** Mensagem do Maestro ("music") ou a lista de comandos fixada ("music_commands"). */
export const isMaestroMessageKind = (kind: string | null | undefined): boolean => kind === 'music' || kind === 'music_commands'

// Textos aprovados (spec do Maestro, seção 7), iguais aos do desktop. Não alterar sem aprovação.
export const T14_LABEL = '👁️ Só você vê esta mensagem'
export const T14_DISMISS = 'Dispensar'
export const T16_TITLE = (q: string): string => `🔎 Resultados para "${q}": clique para adicionar à fila`
export const T17 = {
  title: 'Tocando agora',
  next: 'Próximas',
  skip: 'Pular',
  vote: (votes: number, needed: number): string => `Votar para pular · ${votes}/${needed}`,
  empty: 'Nada na fila. Use /play'
}
export const T18_TAG = 'BOT'
export const T20 = {
  seeMore: (hidden: number): string => `Ver mais (${hidden})`,
  seeLess: 'Ver menos'
}
/** Quantas músicas da fila o painel mostra antes do "Ver mais". */
export const QUEUE_PREVIEW = 3

export interface SlashSuggestion {
  command: string
  aliases: string[]
  usage: string
  description?: string
}

/** Comandos do Maestro (só em canal de servidor). */
export const MUSIC_COMMANDS: SlashSuggestion[] = [
  { command: '/play', aliases: ['/p', '/tocar'], usage: '/play <link ou nome>' },
  { command: '/skip', aliases: ['/s', '/pular'], usage: '/skip' },
  { command: '/fila', aliases: ['/q'], usage: '/fila' },
  { command: '/help', aliases: ['/ajuda', '/musica'], usage: '/help' }
]

/** Sugestões ao digitar "/" (some depois do primeiro espaço). */
export function slashSuggestions(input: string, commands: SlashSuggestion[] = MUSIC_COMMANDS): SlashSuggestion[] {
  if (!input.startsWith('/') || /\s/.test(input)) return []
  const typed = input.toLowerCase()
  return commands.filter((c) => [c.command, ...c.aliases].some((name) => name.startsWith(typed)))
}

export function formatDuration(ms: number): string {
  const total = Math.floor(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number): string => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

/** Só troca duas músicas diferentes, as duas pedidas por mim. */
export function canSwap(a: MusicItem, b: MusicItem, meId: string | null | undefined): boolean {
  return !!meId && a.id !== b.id && a.requested_by.id === meId && b.requested_by.id === meId
}

/** "**negrito**" das mensagens do Maestro. */
export function splitBold(text: string): { text: string; bold: boolean }[] {
  return text
    .split('**')
    .map((part, i) => ({ text: part, bold: i % 2 === 1 }))
    .filter((p) => p.text !== '')
}
