import { DISAPPEARING_OPTIONS } from '../../disappearing/lib/disappearing'

/** "Mensagens temporárias" no Editar canal: prazo das novas mensagens (0 = desativadas). */
function ChannelDisappearingField({
  value,
  onChange
}: {
  value: number
  onChange: (seconds: number) => void
}): React.JSX.Element {
  return (
    <div>
      <label
        className="mb-1 block text-ds-sm font-medium text-muted"
        htmlFor="channel-disappearing"
      >
        Mensagens temporárias
      </label>
      <select
        id="channel-disappearing"
        name="channel-disappearing"
        className="glass-input min-h-10 w-full"
        value={value}
        aria-describedby="channel-disappearing-help"
        onChange={(e) => onChange(Number(e.target.value))}
      >
        {DISAPPEARING_OPTIONS.map((o) => (
          <option key={o.seconds ?? 0} value={o.seconds ?? 0} className="bg-floating">
            {o.label}
          </option>
        ))}
      </select>
      <p id="channel-disappearing-help" className="mt-1 text-ds-sm text-faint">
        As novas mensagens do canal somem depois do prazo. As que já foram enviadas não mudam.
      </p>
    </div>
  )
}

export default ChannelDisappearingField
