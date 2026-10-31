import { playNotes } from '../../call/lib/sounds'
import IconButton from '../../../shared/ui/IconButton'
import { PlayIcon } from '../../../shared/ui/icons'
import { SOUND_PACKS, type SoundPack } from '../lib/packs'

/** Cartões dos pacotes (um grupo de rádio): escolher vale para todos os eventos. */
function SoundPackPicker({
  value,
  volume,
  onChange
}: {
  value: string
  volume: number
  onChange: (packId: string) => void
}): React.JSX.Element {
  // Prévia: a menção mostra bem o clima de cada pacote.
  const preview = (pack: SoundPack): void => playNotes(pack.sounds.mention, { gain: volume / 100 })
  return (
    <fieldset>
      <legend className="mb-2 text-ds-md font-medium text-strong">Pacote de sons</legend>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {SOUND_PACKS.map((pack) => {
          const selected = pack.id === value
          return (
            <div
              key={pack.id}
              className={`flex min-w-0 items-center gap-2 rounded-lg border p-2 transition-colors ${
                selected ? 'border-brand bg-brand/10' : 'border-subtle bg-fg/5 hover:bg-fg/10'
              }`}
            >
              <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-md p-1 focus-within:ring-2 focus-within:ring-brand">
                <input
                  type="radio"
                  name="sound-pack"
                  value={pack.id}
                  checked={selected}
                  onChange={() => {
                    onChange(pack.id)
                    preview(pack)
                  }}
                  className="size-4 shrink-0 cursor-pointer accent-brand"
                />
                <span className="min-w-0">
                  <span className="block truncate text-ds-sm font-medium text-strong">{pack.label}</span>
                  <span className="block text-ds-xs text-muted">{pack.description}</span>
                </span>
              </label>
              <IconButton icon={PlayIcon} label={`Ouvir o pacote ${pack.label}`} onClick={() => preview(pack)} />
            </div>
          )
        })}
      </div>
    </fieldset>
  )
}

export default SoundPackPicker
