import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import AuthLayout from '../components/AuthLayout'
import Button from '../../../shared/ui/Button'
import Input from '../../../shared/ui/Input'
import BirthdayFields from '../../profile/components/BirthdayFields'
import { type BirthdayValue } from '../../profile/lib/birthday'
import {
  confirmError,
  displayNameError,
  emailError,
  passwordError,
  passwordStrength,
  usernameError,
  validateRegister,
  type FieldErrors,
  type RegisterField
} from '../lib/authForms'
import { register } from '../api/auth'
import { registerErrorMessage } from '../lib/loginError'
import { getMe } from '../../profile/api/users'
import { useAuthStore } from '../store/authStore'
import { useInviteLinkStore } from '../../servers/store/inviteLinkStore'
import { authPathWithInvite, inviteCodeFromSearch } from '../../servers/lib/inviteLink'
import { SignupConsent } from '../../legal/components/LegalLinks'

const STRENGTH_LABEL = ['', 'Fraca', 'Razoável', 'Boa', 'Forte']
const STRENGTH_COLOR = ['', 'bg-red-400', 'bg-orange-400', 'bg-yellow-400', 'bg-emerald-400']

function Register(): React.JSX.Element {
  const navigate = useNavigate()
  // Veio de um link de convite: depois de criar a conta, abre a confirmação.
  const inviteCode = inviteCodeFromSearch(useLocation().search)
  const setTokens = useAuthStore((s) => s.setTokens)
  const setUser = useAuthStore((s) => s.setUser)

  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [birthday, setBirthday] = useState<BirthdayValue>({ day: null, month: null, year: null })
  const [errors, setErrors] = useState<FieldErrors<RegisterField>>({})
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const setFieldError = (field: RegisterField, message: string | null): void =>
    setErrors((prev) => {
      const next = { ...prev }
      if (message) next[field] = message
      else delete next[field]
      return next
    })

  const strength = passwordStrength(password)

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    setError(null)

    const found = validateRegister({ username, displayName, email, password, confirm, birthday })
    setErrors(found)
    if (Object.keys(found).length > 0) return

    setLoading(true)
    try {
      const tokens = await register({
        username: username.trim(),
        display_name: displayName.trim(),
        email: email.trim(),
        password,
        ...(birthday.day && birthday.month && birthday.year
          ? {
              birthday_day: birthday.day,
              birthday_month: birthday.month,
              birthday_year: birthday.year
            }
          : {})
      })
      if (inviteCode) useInviteLinkStore.getState().open(inviteCode)
      setTokens(tokens.access_token, tokens.refresh_token)
      const me = await getMe()
      setUser(me)
      navigate('/')
    } catch (err) {
      const status = (err as { status?: number }).status
      if (status === 409) {
        // O backend não diz qual dos dois: marca os dois, sem revelar contas.
        const taken = 'Nome de usuário ou e-mail já em uso.'
        setErrors({ username: taken, email: taken })
      } else {
        setError(registerErrorMessage(err))
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout wide>
      <h1 className="text-2xl font-semibold text-gray-50">Criar uma conta</h1>
      {inviteCode && (
        <p className="mt-3 rounded-lg border border-violet-400/30 bg-violet-500/10 px-3 py-2 text-sm text-violet-200">
          Crie sua conta para aceitar o convite.
        </p>
      )}
      <p className="mb-6 mt-1 text-sm text-gray-400">
        Enviaremos um e-mail para confirmar o seu endereço.
      </p>
      <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
        <Input
          label="E-mail"
          type="email"
          autoComplete="email"
          value={email}
          error={errors.email}
          onChange={(e) => setEmail(e.target.value)}
          onBlur={() => email && setFieldError('email', emailError(email))}
          autoFocus
        />
        <Input
          label="Nome de exibição"
          autoComplete="nickname"
          value={displayName}
          error={errors.displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          onBlur={() => displayName && setFieldError('displayName', displayNameError(displayName))}
        />
        <Input
          label="Nome de usuário"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          value={username}
          error={errors.username}
          onChange={(e) => setUsername(e.target.value)}
          onBlur={() => username && setFieldError('username', usernameError(username))}
        />
        <div className="flex flex-col gap-2">
          <Input
            label="Senha"
            type="password"
            reveal
            autoComplete="new-password"
            value={password}
            error={errors.password}
            onChange={(e) => setPassword(e.target.value)}
            onBlur={() => password && setFieldError('password', passwordError(password))}
          />
          {password && (
            <div className="flex items-center gap-2" aria-live="polite">
              <div className="flex h-1.5 flex-1 gap-1">
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className={`flex-1 rounded-full ${i <= strength ? STRENGTH_COLOR[strength] : 'bg-fg/10'}`}
                  />
                ))}
              </div>
              <span className="w-16 text-right text-xs text-gray-400">
                {STRENGTH_LABEL[strength]}
              </span>
            </div>
          )}
        </div>
        <Input
          label="Confirmar senha"
          type="password"
          reveal
          autoComplete="new-password"
          value={confirm}
          error={errors.confirm}
          onChange={(e) => setConfirm(e.target.value)}
          onBlur={() => confirm && setFieldError('confirm', confirmError(password, confirm))}
        />
        <BirthdayFields value={birthday} onChange={setBirthday} />
        {errors.birthday && <p className="text-sm text-red-300">{errors.birthday}</p>}
        {error && (
          <p className="rounded-lg border border-red-400/30 bg-red-500/15 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        )}
        <SignupConsent />
        <Button type="submit" className="mt-1 w-full py-2.5" disabled={loading}>
          {loading ? 'Criando conta...' : 'Continuar'}
        </Button>
      </form>
      <p className="mt-4 text-sm text-gray-400">
        <Link
          to={authPathWithInvite('/login', inviteCode)}
          className="font-medium text-violet-400 hover:underline"
        >
          Já tem uma conta?
        </Link>
      </p>
    </AuthLayout>
  )
}

export default Register
