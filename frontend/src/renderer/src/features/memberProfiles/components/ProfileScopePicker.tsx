import { useServerStore } from '../../servers/store/serverStore'
import SectionHeader from '../../../shared/ui/SectionHeader'
import { useProfileEditorScopeStore } from '../store/profileEditorScopeStore'

const GLOBAL = ''

/** "Perfil global / <servidor>" no topo de Configurações → Perfis. */
export default function ProfileScopePicker(): React.JSX.Element | null {
  const servers = useServerStore((s) => s.servers)
  const serverId = useProfileEditorScopeStore((s) => s.serverId)
  const setServerId = useProfileEditorScopeStore((s) => s.setServerId)
  if (servers.length === 0) return null
  return (
    <label className="flex w-full flex-col gap-2 sm:max-w-sm">
      <SectionHeader>Qual perfil editar</SectionHeader>
      <select
        value={serverId ?? GLOBAL}
        onChange={(e) => setServerId(e.target.value || null)}
        name="profile-scope"
        className="glass-input focus-ring min-h-10 cursor-pointer"
      >
        <option value={GLOBAL}>Perfil global</option>
        {servers.map((server) => (
          <option key={server.id} value={server.id}>
            {server.name}
          </option>
        ))}
      </select>
    </label>
  )
}
