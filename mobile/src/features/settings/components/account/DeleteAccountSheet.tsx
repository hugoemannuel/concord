import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { colors, fontSize, radius, spacing } from '../../../../shared/theme/tokens'
import { Button } from '../../../../shared/ui/Button'
import { Input } from '../../../../shared/ui/Input'
import { ModalSheet } from '../../../../shared/ui/ModalSheet'
import { SwitchRow } from '../../../../shared/ui/SwitchRow'
import { deleteAccount } from '../../../auth/api/account'
import { submitAccountDeletion, type DeletionFailure } from '../../../auth/lib/accountDeletion'
import { leaveDevice } from '../../lib/leaveDevice'

/** O que deu errado: a mensagem ou os servidores que impedem. */
function DeletionError({ failure }: { failure: DeletionFailure }) {
  if (failure.kind === 'message') {
    return (
      <Text accessibilityRole="alert" style={styles.error}>
        {failure.message}
      </Text>
    )
  }
  return (
    <View accessibilityRole="alert" style={styles.servers}>
      <Text style={styles.text}>
        Você é dono de servidores que têm outros membros. Transfira a posse (pelo app no computador ou no navegador)
        ou apague cada um antes de excluir a conta:
      </Text>
      {failure.servers.map((s) => (
        <Text key={s.id} style={styles.text}>
          {`• ${s.name}`}
        </Text>
      ))}
    </View>
  )
}

/** Excluir a conta de vez: o que acontece, a senha atual e a confirmação (textos do desktop). */
export function DeleteAccountSheet({ onClose }: { onClose: () => void }) {
  const [password, setPassword] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [failure, setFailure] = useState<DeletionFailure | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(): Promise<void> {
    setBusy(true)
    const result = await submitAccountDeletion({ password, confirmed, send: deleteAccount })
    setFailure(result)
    if (result) {
      setBusy(false)
      return
    }
    await leaveDevice()
  }

  return (
    <ModalSheet title="Excluir conta" onClose={busy ? undefined : onClose}>
      <Text style={styles.text}>
        A conta é excluída na hora e não dá para desfazer. Saem o perfil, os arquivos dele, amizades, conversas a dois e
        os servidores em que você é o único membro.
      </Text>
      <Text style={styles.text}>
        As mensagens que você mandou em servidores e grupos ficam, como de “Usuário removido”. Se quiser que elas sumam,
        apague-as antes.
      </Text>
      <Input label="Senha atual" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" />
      <SwitchRow title="Entendo que a exclusão é definitiva." value={confirmed} onChange={setConfirmed} />
      {failure ? <DeletionError failure={failure} /> : null}
      <View style={styles.actions}>
        <Button title="Cancelar" variant="secondary" onPress={onClose} disabled={busy} />
        <Button title="Excluir conta" variant="danger" onPress={() => void submit()} loading={busy} />
      </View>
    </ModalSheet>
  )
}

const styles = StyleSheet.create({
  text: { color: colors.textNormal, fontSize: fontSize.sm },
  error: { color: colors.textDanger, fontSize: fontSize.sm },
  servers: { gap: spacing.xs, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.bgInput },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm }
})
