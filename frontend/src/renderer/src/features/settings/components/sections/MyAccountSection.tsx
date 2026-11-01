import { useState } from 'react'
import { useAuthStore } from '../../../auth/store/authStore'
import { useSettingsStore } from '../../store/settingsStore'
import { formatMemberSince } from '../../../profile/lib/profileCard'
import { formatBirthday } from '../../../profile/lib/birthday'
import { useBirthday } from '../../../profile/hooks/useBirthday'
import AccountHeader, { ACCOUNT_CARD_BG } from '../account/AccountHeader'
import AccountModals, { type AccountModal } from '../account/AccountModals'
import { AccountRow, MaskedEmail } from '../account/AccountRow'
import AccountDangerZone from '../account/AccountDangerZone'

/**
 * Configurações → Minha conta, como no Discord: cartão com banner e avatar e
 * os dados da conta. Cada linha que dá para mudar tem um "Editar" que abre o
 * modal dela e salva na hora (o @ e o e-mail pedem a senha atual).
 */
function MyAccountSection(): React.JSX.Element | null {
  const user = useAuthStore((s) => s.user)
  const goTo = useSettingsStore((s) => s.goTo)
  const [modal, setModal] = useState<AccountModal | null>(null)
  const birthday = useBirthday()

  if (!user) return null

  const since = formatMemberSince(user.created_at)
  const edit = (target: AccountModal) => () => setModal(target)

  return (
    <>
      <div
        className="overflow-hidden rounded-xl border border-subtle"
        style={{ background: ACCOUNT_CARD_BG }}
      >
        <AccountHeader user={user} onEditProfile={() => goTo('profiles')} />

        <div className="px-4 pb-4">
          <div className="mt-4 divide-y divide-subtle rounded-lg bg-input px-4">
            <AccountRow
              label="Nome de exibição"
              value={user.display_name || user.username}
              onEdit={edit('name')}
            />
            <AccountRow label="Nome de usuário" value={user.username} onEdit={edit('username')} />
            <AccountRow
              label="E-mail"
              value={<MaskedEmail email={user.email} />}
              onEdit={edit('email')}
            />
            <AccountRow
              label="Aniversário"
              value={birthday.birthday ? formatBirthday(birthday.birthday) : 'Carregando…'}
              onEdit={birthday.birthday ? edit('birthday') : undefined}
            />
            {since && <AccountRow label="Membro desde" value={since} />}
          </div>
        </div>

        <AccountModals
          modal={modal}
          user={user}
          birthday={birthday}
          onClose={() => setModal(null)}
        />
      </div>
      <AccountDangerZone />
    </>
  )
}

export default MyAccountSection
