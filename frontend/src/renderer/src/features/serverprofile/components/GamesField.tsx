import { useMemo, useState } from 'react'
import { CheckIcon } from '../../../shared/ui/icons'
import Input from '../../../shared/ui/Input'
import SectionHeader from '../../../shared/ui/SectionHeader'
import GameIcon from '../../activity/components/GameIcon'
import type { ServerGame } from '../api/serverProfile'
import { useMemberGames } from '../hooks/useMemberGames'
import { gameTileAccent, knownGames, searchGames, toggleGame } from '../lib/gameSearch'
import { MAX_GAMES } from '../lib/profileDraft'

/** O quadro de um jogo (o ícone e a cor dele: nada de capa de terceiros). */
function GameTile({
  game,
  selected,
  onToggle
}: {
  game: ServerGame
  selected: boolean
  onToggle: () => void
}): React.JSX.Element {
  const accent = gameTileAccent(game.name)
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onToggle}
      className={`focus-ring relative flex min-h-24 min-w-0 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border bg-fg/5 p-2 text-center transition-colors hover:bg-fg/10 ${
        selected ? 'border-brand ring-1 ring-brand' : 'border-subtle'
      }`}
      style={accent ? { backgroundImage: `linear-gradient(160deg, ${accent}33, transparent 70%)` } : undefined}
    >
      {selected && (
        <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded bg-brand text-white">
          <CheckIcon size={12} />
        </span>
      )}
      <GameIcon name={game.name} appId={game.app_id} iconHash={game.icon_hash} className="h-8 w-8" />
      <span className="line-clamp-2 break-words text-ds-xs font-medium text-strong">{game.name}</span>
    </button>
  )
}

function GameGrid({
  games,
  selected,
  onToggle
}: {
  games: ServerGame[]
  selected: ServerGame[]
  onToggle: (game: ServerGame) => void
}): React.JSX.Element {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
      {games.map((game) => (
        <GameTile
          key={game.name}
          game={game}
          selected={selected.some((g) => g.name === game.name)}
          onToggle={() => onToggle(game)}
        />
      ))}
    </div>
  )
}

/** Busca pelos jogos conhecidos, os escolhidos e o que os membros jogam. */
export default function GamesField({
  serverId,
  selected,
  onChange
}: {
  serverId: string
  selected: ServerGame[]
  onChange: (games: ServerGame[]) => void
}): React.JSX.Element {
  const [query, setQuery] = useState('')
  const memberGames = useMemberGames(serverId)
  const known = useMemo(() => knownGames(memberGames), [memberGames])
  const results = useMemo(() => searchGames(query, known, 12), [query, known])
  const toggle = (game: ServerGame): void => onChange(toggleGame(selected, game))
  return (
    <div className="flex flex-col gap-4">
      <Input
        placeholder="Buscar um jogo…"
        aria-label="Buscar um jogo"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {query.trim() !== '' && (
        <div>
          {results.length > 0 ? (
            <GameGrid games={results} selected={selected} onToggle={toggle} />
          ) : (
            <p className="text-ds-sm text-muted">Nenhum jogo com esse nome.</p>
          )}
        </div>
      )}
      {selected.length > 0 && (
        <div>
          <SectionHeader as="p" className="mb-2" count={selected.length}>
            Em destaque (até {MAX_GAMES})
          </SectionHeader>
          <GameGrid games={selected} selected={selected} onToggle={toggle} />
        </div>
      )}
      {memberGames.length > 0 && (
        <div>
          <SectionHeader as="p" className="mb-2">
            Seus membros jogam
          </SectionHeader>
          <GameGrid games={memberGames} selected={selected} onToggle={toggle} />
        </div>
      )}
    </div>
  )
}
