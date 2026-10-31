import Input from '../../../shared/ui/Input'
import { GAME_OPTIONS, NO_GAME, OTHER_GAME } from '../lib/eventGame'
import { MAX_GAME } from '../lib/eventForm'

/** O jogo do evento (opcional): um do catálogo da atividade ou "Outro jogo…" com nome livre. */
export default function GameField({
  choice,
  custom,
  disabled = false,
  onChange
}: {
  choice: string
  custom: string
  disabled?: boolean
  onChange: (patch: { gameChoice?: string; customGame?: string }) => void
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1.5 text-ds-sm font-medium text-secondary">
        Jogo (opcional)
        <select
          name="event-game"
          disabled={disabled}
          className="glass-input"
          value={choice}
          onChange={(e) => onChange({ gameChoice: e.target.value })}
        >
          <option value={NO_GAME} className="bg-floating">
            Nenhum jogo
          </option>
          {GAME_OPTIONS.map((o) => (
            <option key={o.value} value={o.value} className="bg-floating">
              {o.label}
            </option>
          ))}
          <option value={OTHER_GAME} className="bg-floating">
            Outro jogo…
          </option>
        </select>
      </label>
      {choice === OTHER_GAME && (
        <Input
          label="Nome do jogo"
          name="event-game-custom"
          value={custom}
          maxLength={MAX_GAME}
          autoComplete="off"
          disabled={disabled}
          onChange={(e) => onChange({ customGame: e.target.value })}
        />
      )}
    </div>
  )
}
