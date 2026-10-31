import { GAMES } from '../../../../../shared/gameCatalog'

// O jogo do evento: escolhido entre os do catálogo da atividade ou digitado
// ("Outro jogo…"). O servidor guarda só o nome (backend/internal/event).

/** Valor do seletor para "nenhum jogo". */
export const NO_GAME = ''

/** Valor do seletor para "Outro jogo…" (o nome vem do campo de texto). */
export const OTHER_GAME = '__outro__'

/** Os jogos do catálogo, na ordem dele (valor = o nome que a detecção manda). */
export const GAME_OPTIONS: { value: string; label: string }[] = GAMES.map((g) => ({
  value: g.name,
  label: g.name
}))

/** Qual opção do seletor representa o jogo salvo (jogo fora do catálogo vira "Outro" já preenchido). */
export function gameChoiceOf(name: string | null): { choice: string; custom: string } {
  if (!name) return { choice: NO_GAME, custom: '' }
  return GAMES.some((g) => g.name === name)
    ? { choice: name, custom: '' }
    : { choice: OTHER_GAME, custom: name }
}

/** O nome do jogo que o formulário manda ('' = sem jogo). */
export function gameNameOf(choice: string, custom: string): string {
  return choice === OTHER_GAME ? custom.trim() : choice
}

/** Minúsculas, sem acento e sem espaços nas pontas: para comparar nomes de jogo. */
export function normalizeGame(name: string): string {
  return name.normalize('NFD').replace(/\p{M}/gu, '').trim().toLowerCase()
}

/** A atividade da pessoa é o jogo do evento (para o selo "Jogando"). */
export function isPlayingGame(activityName: string | undefined, eventGame: string | null): boolean {
  if (!activityName || !eventGame) return false
  return normalizeGame(activityName) === normalizeGame(eventGame)
}
