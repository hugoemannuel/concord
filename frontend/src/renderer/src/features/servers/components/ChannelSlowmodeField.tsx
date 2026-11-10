import { SLOWMODE_OPTIONS } from '../../chat/lib/slowmode'

/** "Modo lento" no Editar canal: intervalo mínimo entre as mensagens de cada membro. */
function ChannelSlowmodeField({
  value,
  onChange
}: {
  value: number
  onChange: (seconds: number) => void
}): React.JSX.Element {
  return (
    <div>
      <label className="mb-1 block text-ds-sm font-medium text-muted" htmlFor="channel-slowmode">
        Modo lento
      </label>
      <select
        id="channel-slowmode"
        name="channel-slowmode"
        className="glass-input min-h-10 w-full"
        value={value}
        aria-describedby="channel-slowmode-help"
        onChange={(e) => onChange(Number(e.target.value))}
      >
        {SLOWMODE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value} className="bg-floating">
            {o.label}
          </option>
        ))}
      </select>
      <p id="channel-slowmode-help" className="mt-1 text-ds-sm text-faint">
        Cada membro só pode mandar uma mensagem a cada intervalo. Quem tem Gerenciar mensagens ou
        Gerenciar canais fica isento.
      </p>
    </div>
  )
}

export default ChannelSlowmodeField
