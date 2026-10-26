import { useState } from 'react'
import { Link } from 'react-router-dom'
import AuthLayout from '../components/AuthLayout'
import Button from '../components/Button'
import Input from '../components/Input'
import { normalizeServerAddress } from '../../../shared/serverAddress'

/** Tela inicial → "Entrar num servidor": confere o endereço e reabre o app nele. */
function ConnectServer(): React.JSX.Element {
  const [address, setAddress] = useState('')
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    setError(null)
    const normalized = normalizeServerAddress(address)
    if (!normalized.ok) {
      setFieldError(normalized.error)
      return
    }
    setFieldError(null)
    const server = window.api?.server
    if (!server) return
    setConnecting(true)
    // Deu certo: o main salva e reabre o app (esta tela some sozinha).
    const result = await server.connect(normalized.url).catch(() => null)
    if (!result || !result.ok) {
      setError(result?.error ?? 'Não foi possível falar com esse servidor.')
      setConnecting(false)
    }
  }

  return (
    <AuthLayout>
      <h1 className="text-2xl font-semibold text-gray-50">Entrar num servidor</h1>
      <p className="mb-6 mt-1 text-sm text-gray-400">
        Cole o endereço que quem hospeda o servidor te passou.
      </p>
      <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
        <Input
          label="Endereço do servidor"
          type="text"
          placeholder="http://189.0.0.1:8080"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          value={address}
          error={fieldError}
          onChange={(e) => setAddress(e.target.value)}
          autoFocus
        />
        {error && (
          <p className="rounded-lg border border-red-400/30 bg-red-500/15 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        )}
        <Button type="submit" className="w-full py-2.5" disabled={connecting}>
          {connecting ? 'Conectando...' : 'Conectar'}
        </Button>
      </form>
      <p className="mt-4 text-sm text-gray-400">
        Vai hospedar?{' '}
        <Link to="/hospedar" className="font-medium text-violet-400 hover:underline">
          Hospedar um servidor
        </Link>
        {' · '}
        <Link to="/" className="font-medium text-violet-400 hover:underline">
          Voltar
        </Link>
      </p>
    </AuthLayout>
  )
}

export default ConnectServer
