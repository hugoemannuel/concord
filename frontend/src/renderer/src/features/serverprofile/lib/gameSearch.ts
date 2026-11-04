// A busca de jogos em destaque: o catálogo que o app reconhece e o que os
// membros do servidor jogam. Puro.

import { GAMES } from '../../../../../shared/gameCatalog'
import type { ServerGame } from '../api/serverProfile'
import { MAX_GAMES } from './profileDraft'

const normalize = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()

/** O catálogo mais os jogos dos membros (estes têm o ícone da Steam, e ficam). */
export function knownGames(memberGames: ServerGame[]): ServerGame[] {
  const byName = new Map<string, ServerGame>(GAMES.map((g) => [g.name, { name: g.name }]))
  for (const game of memberGames) byName.set(game.name, game)
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
}

export function searchGames(query: string, games: ServerGame[], limit = 30): ServerGame[] {
  const wanted = normalize(query.trim())
  return games.filter((g) => normalize(g.name).includes(wanted)).slice(0, limit)
}

/** Marca ou desmarca o jogo (no limite, só desmarca). */
export function toggleGame(selected: ServerGame[], game: ServerGame): ServerGame[] {
  if (selected.some((g) => g.name === game.name)) return selected.filter((g) => g.name !== game.name)
  return selected.length >= MAX_GAMES ? selected : [...selected, game]
}

/** A cor de destaque do catálogo, se o jogo está nele. */
export function gameTileAccent(name: string): string | undefined {
  return GAMES.find((g) => g.name === name)?.accent
}
