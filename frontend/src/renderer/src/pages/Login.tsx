import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import AuthLayout from '../components/AuthLayout'
import Button from '../components/Button'
import ConnectionTest from '../components/ConnectionTest'
import Input from '../components/Input'
import { login } from '../api/auth'
import { buildLoginInput, loginIdentifierError } from '../lib/loginIdentifier'
import { isConnectionFailure, loginErrorMessage } from '../lib/loginError'
import { getMe } from '../api/users'
import { useAuthStore } from '../store/authStore'
import { useInviteLinkStore } from '../store/inviteLinkStore'
import { authPathWithInvite, inviteCodeFromSearch } from '../lib/inviteLink'

const INVALID_LOGIN = 'Login ou senha inválidos.'

function Login(): React.JSX.Element {
  const navigate = useNavigate()
  const location = useLocation()
  const notice = (location.state as { notice?: string } | null)?.notice ?? null
  // Veio de um link de convite: depois de entrar, abre a confirmação.
  const inviteCode = inviteCodeFromSearch(location.search)
  const setTokens = useAuthStore((s) => s.setTokens)
  const setUser = useAuthStore((s) => s.setUser)

  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [identifierErr, setIdentifierErr] = useState<string | null>(null)
  const [passwordErr, setPasswordErr] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [offline, setOffline] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    setError(null)
    setOffline(false)

    const idError = loginIdentifierError(identifier)
    const pwError = password ? null : 'Informe sua senha.'
    setIdentifierErr(idError)
    setPasswordErr(pwError)
    if (idError || pwError) return

    setLoading(true)
    try {
      const tokens = await login(buildLoginInput(identifier, password))
      if (inviteCode) useInviteLinkStore.getState().open(inviteCode)
      setTokens(tokens.access_token, tokens.refresh_token)
      const me = await getMe()
      setUser(me)
      navigate('/')
    } catch (err) {
      const status = (err as { status?: number }).status
      if (status === 401) {
        // Como no Discord: não diz qual dos dois está errado.
        setIdentifierErr(INVALID_LOGIN)
        setPasswordErr(INVALID_LOGIN)
      } else {
        setError(loginErrorMessage(err))
        setOffline(isConnectionFailure(err))
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout>
      <h1 className="text-2xl font-semibold text-gray-50">Boas-vindas de volta!</h1>
      <p className="mb-6 mt-1 text-sm text-gray-400">Que bom te ver de novo na Salinha.</p>
      {inviteCode && (
        <p className="mb-4 rounded-lg border border-violet-400/30 bg-violet-500/10 px-3 py-2 text-sm text-violet-200">
          Entre na sua conta para aceitar o convite.
        </p>
      )}
      {notice && (
        <p className="mb-4 rounded-lg border border-emerald-400/30 bg-emerald-500/15 px-3 py-2 text-sm text-emerald-300">
          {notice}
        </p>
      )}
      <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
        <Input
          label="E-mail ou nome de usuário"
          type="text"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          value={identifier}
          error={identifierErr}
          onChange={(e) => setIdentifier(e.target.value)}
          autoFocus
        />
        <div className="flex flex-col gap-1.5">
          <Input
            label="Senha"
            type="password"
            reveal
            autoComplete="current-password"
            value={password}
            error={passwordErr}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Link
            to="/forgot-password"
            className="w-fit text-sm font-medium text-violet-400 hover:underline"
          >
            Esqueceu a senha?
          </Link>
        </div>
        {error && (
          <p className="rounded-lg border border-red-400/30 bg-red-500/15 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        )}
        {offline && <ConnectionTest />}
        <Button type="submit" className="w-full py-2.5" disabled={loading}>
          {loading ? 'Entrando...' : 'Entrar'}
        </Button>
      </form>
      <p className="mt-4 text-sm text-gray-400">
        Precisando de uma conta?{' '}
        <Link
          to={authPathWithInvite('/register', inviteCode)}
          className="font-medium text-violet-400 hover:underline"
        >
          Registre-se
        </Link>
      </p>
    </AuthLayout>
  )
}

export default Login
