import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Banner } from '../../../shared/ui/Banner'
import { Button } from '../../../shared/ui/Button'
import { Input } from '../../../shared/ui/Input'
import { TextLink } from '../../../shared/ui/TextLink'
import { colors, fontSize, spacing } from '../../../shared/theme/tokens'
import { authDeps } from '../lib/authDeps'
import { runRegister, type AuthDeps } from '../lib/authFlow'
import { validateRegister, type FieldErrors, type RegisterField } from '../lib/authForms'
import { SignupConsent } from '../../legal/components/LegalLinks'

interface RegisterFormProps {
  deps?: AuthDeps
  onLogin: () => void
}

export function RegisterForm({ deps = authDeps, onLogin }: RegisterFormProps) {
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState<FieldErrors<RegisterField>>({})
  const [failure, setFailure] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function submit(): Promise<void> {
    const fieldErrors = validateRegister({ username, displayName, email, password, confirm })
    setErrors(fieldErrors)
    setFailure(null)
    if (Object.keys(fieldErrors).length > 0) return
    setLoading(true)
    const outcome = await runRegister(deps, {
      username: username.trim(),
      display_name: displayName.trim(),
      email: email.trim(),
      password
    })
    setLoading(false)
    if (outcome.kind === 'error') setFailure(outcome.message)
  }

  return (
    <View style={styles.form}>
      <Text style={styles.title}>Criar uma conta</Text>
      <Input
        label="E-mail"
        value={email}
        onChangeText={setEmail}
        error={errors.email}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        autoCorrect={false}
      />
      <Input label="Nome de exibição" value={displayName} onChangeText={setDisplayName} error={errors.displayName} />
      <Input
        label="Nome de usuário"
        value={username}
        onChangeText={setUsername}
        error={errors.username}
        autoCapitalize="none"
        autoComplete="username-new"
        autoCorrect={false}
      />
      <Input
        label="Senha"
        value={password}
        onChangeText={setPassword}
        error={errors.password}
        secureTextEntry
        autoComplete="new-password"
      />
      <Input
        label="Confirmar senha"
        value={confirm}
        onChangeText={setConfirm}
        error={errors.confirm}
        secureTextEntry
        autoComplete="new-password"
      />
      {failure ? <Banner message={failure} /> : null}
      <SignupConsent />
      <Button title="Continuar" onPress={submit} loading={loading} />
      <TextLink title="Já tem uma conta?" onPress={onLogin} />
    </View>
  )
}

const styles = StyleSheet.create({
  form: { gap: spacing.lg },
  title: { color: colors.textStrong, fontSize: fontSize.xl, fontWeight: '600' }
})
