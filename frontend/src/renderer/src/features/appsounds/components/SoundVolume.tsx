import { MAX_VOLUME } from '../lib/choice'
import { volumeLabel } from '../lib/eventOptions'

/** Volume de todos os sons do app (0 a 200%). */
function SoundVolume({
  value,
  onChange
}: {
  value: number
  onChange: (volume: number) => void
}): React.JSX.Element {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-ds-md font-medium text-strong">Volume dos sons</span>
      <span className="flex items-center gap-3">
        <input
          type="range"
          min={0}
          max={MAX_VOLUME}
          step={5}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="h-10 min-w-0 flex-1 cursor-pointer accent-brand"
        />
        <span className="w-12 shrink-0 text-right text-ds-sm font-semibold text-secondary" aria-hidden="true">
          {volumeLabel(value)}
        </span>
      </span>
    </label>
  )
}

export default SoundVolume
