import { Toggle } from '../../settings/components/Toggle'
import { useServerThemePrefStore } from '../store/serverThemePrefStore'

/** Configurações → Aparência: ver ou não o fundo que cada servidor escolheu. */
export default function ServerThemeToggle(): React.JSX.Element {
  const enabled = useServerThemePrefStore((s) => s.enabled)
  const setEnabled = useServerThemePrefStore((s) => s.setEnabled)
  return (
    <div className="rounded-xl border border-subtle bg-fg/5 p-4">
      <Toggle
        title="Mostrar o fundo dos servidores"
        description="Enquanto você está num servidor, o app usa o fundo que ele escolheu. Desligado, fica sempre o seu tema."
        checked={enabled}
        onChange={() => setEnabled(!enabled)}
      />
    </div>
  )
}
