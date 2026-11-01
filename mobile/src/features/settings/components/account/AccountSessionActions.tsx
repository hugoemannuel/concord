import { useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { spacing } from '../../../../shared/theme/tokens'
import { Button } from '../../../../shared/ui/Button'
import { ConfirmSheet } from '../../../../shared/ui/ConfirmSheet'
import { logoutAll } from '../../../auth/api/account'
import { leaveDevice } from '../../lib/leaveDevice'
import { DeleteAccountSheet } from './DeleteAccountSheet'

/** Minha conta → sair de todos os dispositivos e excluir a conta (como no desktop). */
export function AccountSessionActions() {
  const [dialog, setDialog] = useState<'logout-all' | 'delete' | null>(null)
  const close = (): void => setDialog(null)

  async function logoutEverywhere(): Promise<void> {
    // Mesmo se o servidor falhar, este aparelho sai (quem pediu queria sair).
    await logoutAll().catch(() => {})
    await leaveDevice()
  }

  return (
    <View style={styles.actions}>
      <Button title="Sair de todos os dispositivos" variant="secondary" onPress={() => setDialog('logout-all')} />
      <Button title="Excluir conta" variant="danger" onPress={() => setDialog('delete')} />
      {dialog === 'logout-all' ? (
        <ConfirmSheet title="Sair de todos os dispositivos" confirmLabel="Sair de todos" onConfirm={logoutEverywhere} onClose={close}>
          Todos os aparelhos e navegadores em que a sua conta está aberta saem na hora, inclusive este. Para voltar, é só
          entrar de novo com a senha.
        </ConfirmSheet>
      ) : null}
      {dialog === 'delete' ? <DeleteAccountSheet onClose={close} /> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  actions: { gap: spacing.sm }
})
