import type { User } from '../../auth/store/authStore'
import Avatar from '../../../shared/ui/Avatar'
import { PencilIcon, SearchIcon } from '../../../shared/ui/icons'
import { LegalFooter } from '../../legal/components/LegalLinks'
import {
  SETTINGS_GROUPS,
  type SettingsSection,
  type SettingsSectionId
} from '../lib/settingsNav'

interface SettingsNavProps {
  user: User | null
  name: string
  query: string
  onQuery: (query: string) => void
  /** Seções que a busca deixa aparecer. */
  visible: SettingsSection[]
  currentId: SettingsSectionId
  onGo: (id: SettingsSectionId) => void
  loggingOut: boolean
  onLogout: () => void
}

/** Coluna da esquerda das Configurações: perfil, busca, seções e "Sair". */
function SettingsNav({
  user,
  name,
  query,
  onQuery,
  visible,
  currentId,
  onGo,
  loggingOut,
  onLogout
}: SettingsNavProps): React.JSX.Element {
  return (
    <>
      <button
        type="button"
        onClick={() => onGo('profiles')}
        className="m-3 flex cursor-pointer items-center gap-3 rounded-lg p-2 text-left transition-colors hover:bg-fg/5"
      >
        <Avatar
          userId={user?.id}
          name={name}
          avatarUrl={user?.avatar_url}
          size={40}
          animate="always"
        />
        <span className="min-w-0">
          <span className="block truncate text-ds-md font-medium text-strong">{name}</span>
          <span className="flex items-center gap-1 text-ds-xs text-muted">
            Editar perfis <PencilIcon className="h-3 w-3" />
          </span>
        </span>
      </button>

      <label className="mx-3 mb-3 flex items-center gap-2 rounded-lg border border-subtle bg-input px-3 py-2 focus-within:border-brand">
        <SearchIcon className="h-4 w-4 shrink-0 text-muted" />
        <input
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Buscar"
          aria-label="Buscar nas configurações"
          className="min-w-0 flex-1 bg-transparent text-ds-md text-strong placeholder:text-faint focus:outline-none"
        />
      </label>

      <nav className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {SETTINGS_GROUPS.map((group) => {
          const items = visible.filter((s) => s.group === group.id)
          if (items.length === 0) return null
          return (
            <div key={group.id} className="mb-4">
              <p className="mb-1 px-2 text-ds-sm font-medium text-faint">{group.label}</p>
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onGo(item.id)}
                  aria-current={item.id === currentId ? 'page' : undefined}
                  className={`mb-0.5 block w-full cursor-pointer rounded-md px-2 py-1.5 text-left text-ds-md font-medium transition-colors ${
                    item.id === currentId
                      ? 'bg-fg/10 text-strong'
                      : 'text-muted hover:bg-fg/5 hover:text-normal'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          )
        })}
        {visible.length === 0 && (
          <p className="px-2 text-ds-md text-faint">Nada encontrado para “{query}”.</p>
        )}

        <div className="mt-2 border-t border-subtle pt-2">
          <button
            type="button"
            onClick={onLogout}
            disabled={loggingOut}
            className="block w-full cursor-pointer rounded-md px-2 py-1.5 text-left text-ds-md font-medium text-danger transition-colors hover:bg-danger/10 disabled:opacity-50"
          >
            {loggingOut ? 'Saindo…' : 'Sair'}
          </button>
          <LegalFooter className="mt-3 px-2" />
        </div>
      </nav>
    </>
  )
}

export default SettingsNav
