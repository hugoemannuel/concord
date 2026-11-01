import { useEffect, useState } from 'react'
import {
  getPrivacy,
  updatePrivacy,
  type FriendRequestPolicy,
  type Privacy
} from '../../../profile/api/users'
import { useFriendStore } from '../../../friends/store/friendStore'
import { Toggle } from '../Toggle'
import { ActivityPrivacy } from './ActivityPrivacy'
import { TelemetryPrivacyNote } from '../../../observability/components/TelemetryPrivacyNote'
import { useSettingsStore } from '../../store/settingsStore'
import { useUIStore } from '../../../../shared/store/uiStore'
import { showToast } from '../../../../shared/store/toastStore'
import router from '../../../../app/router'
import { SettingsSectionsSkeleton } from '../../../../shared/ui/skeleton/layouts'
import SectionHeader from '../../../../shared/ui/SectionHeader'
import { PrivacyPolicyNote } from '../../../legal/components/LegalLinks'

const POLICIES: { id: FriendRequestPolicy; title: string; description: string }[] = [
  { id: 'everyone', title: 'Todos', description: 'Qualquer pessoa com seu nome de usuário.' },
  {
    id: 'mutual_servers',
    title: 'Amigos de amigos e membros de servidores',
    description: 'Quem tem um amigo ou um servidor em comum com você.'
  },
  {
    id: 'mutual_friends',
    title: 'Amigos de amigos',
    description: 'Só quem tem pelo menos um amigo em comum com você.'
  },
  { id: 'nobody', title: 'Ninguém', description: 'Ninguém consegue te mandar pedido de amizade.' }
]

function SectionTitle({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <SectionHeader as="h2" className="mb-3">
      {children}
    </SectionHeader>
  )
}

function blockedLabel(count: number): string {
  if (count === 0) return 'Você não bloqueou ninguém.'
  return count === 1 ? '1 usuário bloqueado.' : `${count} usuários bloqueados.`
}

/**
 * Configurações → Privacidade e segurança: quem pode mandar pedido de
 * amizade, DMs de membros de servidores e os usuários bloqueados. Salva na
 * hora, como no Discord.
 */
export function PrivacySection(): React.JSX.Element {
  const [privacy, setPrivacy] = useState<Privacy | null>(null)
  const [saving, setSaving] = useState(false)
  const blockedCount = useFriendStore((s) => s.blocked.length)
  const loadFriends = useFriendStore((s) => s.loadAll)

  useEffect(() => {
    let cancelled = false
    getPrivacy()
      .then((p) => {
        if (!cancelled) setPrivacy(p)
      })
      .catch(() => showToast.error('Não foi possível carregar a privacidade.'))
    loadFriends()
    return () => {
      cancelled = true
    }
  }, [loadFriends])

  const save = async (next: Privacy): Promise<void> => {
    const previous = privacy
    setPrivacy(next)
    setSaving(true)
    try {
      setPrivacy(await updatePrivacy(next))
    } catch (err) {
      setPrivacy(previous)
      showToast.error(err instanceof Error ? err.message : 'Não foi possível salvar.')
    } finally {
      setSaving(false)
    }
  }

  const openBlocked = (): void => {
    useSettingsStore.getState().close()
    useUIStore.getState().setFriendsTab('blocked')
    void router.navigate('/friends')
  }

  if (!privacy) return <SettingsSectionsSkeleton sections={[4, 1, 1]} />

  return (
    <div className="flex flex-col gap-8">
      <section className="border-b border-subtle pb-6">
        <SectionTitle>Quem pode te enviar pedido de amizade</SectionTitle>
        <div role="radiogroup" className="flex flex-col gap-2">
          {POLICIES.map((p) => {
            const checked = privacy.friend_request_policy === p.id
            return (
              <label
                key={p.id}
                className={`flex cursor-pointer items-center gap-3 rounded-md px-3 py-2.5 transition-colors ${
                  checked ? 'bg-fg/10' : 'bg-input hover:bg-fg/5'
                }`}
              >
                <input
                  type="radio"
                  name="friend-request-policy"
                  checked={checked}
                  disabled={saving}
                  onChange={() => void save({ ...privacy, friend_request_policy: p.id })}
                  className="h-4 w-4 accent-brand"
                />
                <span className="min-w-0">
                  <span className="block text-ds-md font-medium text-strong">{p.title}</span>
                  <span className="block text-ds-sm text-muted">{p.description}</span>
                </span>
              </label>
            )
          })}
        </div>
      </section>

      <section className="border-b border-subtle pb-6">
        <SectionTitle>Mensagens diretas</SectionTitle>
        <Toggle
          title="Permitir DMs de membros de servidores"
          description="Quem não é seu amigo, mas está num servidor com você, pode te mandar mensagem direta. Amigos sempre podem."
          checked={privacy.allow_server_dms}
          onChange={() => void save({ ...privacy, allow_server_dms: !privacy.allow_server_dms })}
        />
      </section>

      <ActivityPrivacy />

      <TelemetryPrivacyNote />

      <PrivacyPolicyNote />

      <section>
        <SectionTitle>Usuários bloqueados</SectionTitle>
        <div className="flex items-center justify-between gap-4">
          <p className="text-ds-md text-secondary">{blockedLabel(blockedCount)}</p>
          <button
            type="button"
            onClick={openBlocked}
            className="cursor-pointer rounded-md bg-fg/10 px-4 py-2 text-ds-sm font-medium text-strong transition-colors hover:bg-fg/15"
          >
            Ver bloqueados
          </button>
        </div>
      </section>
    </div>
  )
}
