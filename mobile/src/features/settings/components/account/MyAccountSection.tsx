import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { colors, fontSize, radius, spacing } from '../../../../shared/theme/tokens'
import { Button } from '../../../../shared/ui/Button'
import { Input } from '../../../../shared/ui/Input'
import { ModalSheet } from '../../../../shared/ui/ModalSheet'
import { usernameLock } from '../../../auth/lib/accountChange'
import { displayNameError } from '../../../auth/lib/authForms'
import { useAuthStore, type User } from '../../../auth/store/authStore'
import { ProfileCard } from '../../../profile/components/card/ProfileCard'
import { useCardPresence } from '../../../profile/hooks/useCardPresence'
import { useBirthday } from '../../../profile/hooks/useBirthday'
import { formatBirthday } from '../../../profile/lib/birthday'
import { formatMemberSince } from '../../../profile/lib/memberSince'
import { saveMyProfileFields } from '../../../profile/store/myProfileActions'
import { AccountRow, MaskedEmail } from './AccountRow'
import { BirthdayEditModal } from './BirthdayEditModal'
import { CredentialModal } from './CredentialModal'
import { LegalFooter } from '../../../legal/components/LegalLinks'

type AccountModal = 'name' | 'username' | 'email' | 'birthday'

/** Nome de exibição: salva na hora (o estilo do nome fica em Perfis). */
function NameModal({ user, onClose, onSaved }: { user: User; onClose: () => void; onSaved: (message: string) => void }) {
  const [name, setName] = useState(user.display_name)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(): Promise<void> {
    const invalid = displayNameError(name)
    if (invalid) return setError(invalid)
    setBusy(true)
    try {
      await saveMyProfileFields({ display_name: name.trim() })
      onSaved('Nome salvo!')
      onClose()
    } catch {
      setError('Não foi possível salvar. Tente de novo.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <ModalSheet title="Nome de exibição" onClose={busy ? undefined : onClose}>
      <Input label="Nome de exibição" value={name} onChangeText={setName} maxLength={32} error={error} />
      <View style={styles.actions}>
        <Button title="Cancelar" variant="secondary" onPress={onClose} disabled={busy} />
        <Button title={busy ? 'Salvando…' : 'Salvar'} onPress={() => void submit()} disabled={busy} />
      </View>
    </ModalSheet>
  )
}

/**
 * Configurações → Minha conta, como no Discord: o cartão do perfil e os dados da conta. Cada linha que dá
 * para mudar tem um "Editar" que abre o modal dela e salva na hora (o @ e o e-mail pedem a senha atual).
 */
export function MyAccountSection() {
  const user = useAuthStore((s) => s.user)
  const presence = useCardPresence(user?.id ?? '')
  const birthday = useBirthday()
  const [modal, setModal] = useState<AccountModal | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  if (!user) return null

  const since = formatMemberSince(user.created_at)
  const close = (): void => setModal(null)
  const edit = (target: AccountModal) => () => setModal(target)
  return (
    <View style={styles.section}>
      <ProfileCard profile={user} status={presence} />
      {saved ? (
        <Text accessibilityRole="alert" style={styles.saved}>
          {saved}
        </Text>
      ) : null}
      <View style={styles.rows}>
        <AccountRow label="Nome de exibição" value={user.display_name || user.username} onEdit={edit('name')} />
        <AccountRow label="Nome de usuário" value={user.username} onEdit={edit('username')} />
        <AccountRow label="E-mail" value={<MaskedEmail email={user.email} />} onEdit={edit('email')} />
        <AccountRow label="Aniversário" value={birthday.birthday ? formatBirthday(birthday.birthday) : 'Carregando…'} onEdit={birthday.birthday ? edit('birthday') : undefined} />
        {since ? <AccountRow label="Membro desde" value={since} /> : null}
      </View>
      <LegalFooter />
      {modal === 'name' ? <NameModal user={user} onClose={close} onSaved={setSaved} /> : null}
      {modal === 'username' || modal === 'email' ? (
        <CredentialModal key={modal} kind={modal} current={user[modal]} locked={modal === 'username' ? usernameLock(user.username_change_available_at) : null} onClose={close} onSaved={setSaved} />
      ) : null}
      {modal === 'birthday' && birthday.birthday ? <BirthdayEditModal initial={birthday.birthday} onSave={birthday.save} onClose={close} onSaved={setSaved} /> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  section: { gap: spacing.lg },
  rows: { paddingHorizontal: spacing.lg, borderRadius: radius.md, backgroundColor: colors.bgInput },
  saved: { color: colors.textPositive, fontSize: fontSize.sm },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm }
})
