import { useEffect, useReducer, useState } from 'react'
import { Link } from 'react-router-dom'
import AuthLayout from '../components/AuthLayout'
import Button from '../components/Button'
import Input from '../components/Input'
import { CheckIcon, XIcon } from '../components/icons'
import { copyText } from '../lib/clipboard'
import {
  HOST_STEPS,
  initialHostWizard,
  reduceHostEvent,
  type HostWizardState,
  type StepState
} from '../lib/hostWizard'
import type { HostEvent, VpsForm } from '../../../shared/hostServer'

type Action = { kind: 'event'; event: HostEvent } | { kind: 'reset' }

function reducer(state: HostWizardState, action: Action): HostWizardState {
  return action.kind === 'reset' ? initialHostWizard() : reduceHostEvent(state, action.event)
}

function StepMark({ state }: { state: StepState }): React.JSX.Element {
  if (state === 'done')
    return (
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-300">
        <CheckIcon className="h-3.5 w-3.5" />
      </span>
    )
  if (state === 'error')
    return (
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-red-500/20 text-red-300">
        <XIcon className="h-3.5 w-3.5" />
      </span>
    )
  if (state === 'running')
    return (
      <span className="h-6 w-6 animate-spin rounded-full border-2 border-violet-400/30 border-t-violet-400" />
    )
  return <span className="h-6 w-6 rounded-full border-2 border-white/10" />
}

function Steps({ state }: { state: HostWizardState }): React.JSX.Element {
  return (
    <ol className="flex flex-col gap-3">
      {HOST_STEPS.map((step) => (
        <li key={step.id} className="flex items-center gap-3">
          <StepMark state={state.steps[step.id]} />
          <span
            className={`text-sm ${state.steps[step.id] === 'pending' ? 'text-gray-500' : 'text-gray-200'}`}
          >
            {step.label}
          </span>
        </li>
      ))}
    </ol>
  )
}

function Notes({ notes }: { notes: string[] }): React.JSX.Element | null {
  if (notes.length === 0) return null
  return (
    <ul className="mt-4 flex flex-col gap-2">
      {notes.map((note) => (
        <li
          key={note}
          className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200"
        >
          {note}
        </li>
      ))}
    </ul>
  )
}

const EMPTY_FORM: VpsForm = { host: '', user: 'root', auth: 'password', autoUpdate: true }

/**
 * Tela inicial → "Hospedar um servidor": instala a Salinha numa VPS pelo SSH
 * (como a VPS oficial: HTTPS, voz e vídeo abertos para qualquer um) e mostra o
 * endereço para mandar aos amigos.
 */
function HostServer(): React.JSX.Element {
  const [state, dispatch] = useReducer(reducer, undefined, initialHostWizard)
  const [form, setForm] = useState<VpsForm>(EMPTY_FORM)
  const [installing, setInstalling] = useState(false)
  const [started, setStarted] = useState(false)
  const host = window.api?.host

  useEffect(() => host?.onEvent((event) => dispatch({ kind: 'event', event })), [host])

  const set = <K extends keyof VpsForm>(key: K, value: VpsForm[K]): void =>
    setForm((f) => ({ ...f, [key]: value }))

  const install = async (): Promise<void> => {
    if (!host) return
    dispatch({ kind: 'reset' })
    setStarted(true)
    setInstalling(true)
    await host.deploy(form)
    setInstalling(false)
  }

  const trustNewIdentity = async (): Promise<void> => {
    if (!host) return
    await host.forgetKey(form.host.trim())
    await install()
  }

  const pickKey = async (): Promise<void> => {
    const path = await host?.pickKey()
    if (path) set('keyPath', path)
  }

  if (!started || (state.error && !installing && !state.publicUrl && !state.hostKeyChanged)) {
    const canInstall =
      form.host.trim() !== '' && (form.auth === 'password' ? !!form.password : !!form.keyPath)
    return (
      <AuthLayout wide>
        <h1 className="text-2xl font-semibold text-gray-50">Hospedar numa VPS</h1>
        <p className="mb-5 mt-1 text-sm text-gray-400">
          A Salinha é instalada na sua VPS e fica aberta para qualquer um, com HTTPS, voz e vídeo.
          No fim você recebe o endereço para mandar aos amigos.
        </p>
        <p className="mb-5 rounded-lg border border-violet-400/30 bg-violet-500/10 px-3 py-2 text-sm text-violet-200">
          Precisa de uma VPS com Debian 12 ou Ubuntu 22.04+ (x86_64, 2 GB de RAM) e do acesso root
          que o provedor mandou. Se o provedor tiver firewall no painel, libere as portas 80 e 443
          (TCP), 7881 (TCP) e 7882 (UDP).
        </p>
        {state.error && (
          <p className="mb-4 rounded-lg border border-red-400/30 bg-red-500/15 px-3 py-2 text-sm text-red-300">
            {state.error}
          </p>
        )}
        <form
          className="flex flex-col gap-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            if (canInstall) void install()
          }}
        >
          <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
            <Input
              label="IP da VPS"
              placeholder="74.0.5.252"
              autoCapitalize="none"
              spellCheck={false}
              value={form.host}
              onChange={(e) => set('host', e.target.value)}
              autoFocus
            />
            <Input
              label="Usuário"
              autoCapitalize="none"
              spellCheck={false}
              value={form.user}
              onChange={(e) => set('user', e.target.value)}
            />
          </div>
          <div className="flex gap-2" role="radiogroup" aria-label="Como entrar na VPS">
            <Button
              type="button"
              variant={form.auth === 'password' ? 'primary' : 'ghost'}
              aria-checked={form.auth === 'password'}
              role="radio"
              onClick={() => set('auth', 'password')}
            >
              Senha
            </Button>
            <Button
              type="button"
              variant={form.auth === 'key' ? 'primary' : 'ghost'}
              aria-checked={form.auth === 'key'}
              role="radio"
              onClick={() => set('auth', 'key')}
            >
              Chave SSH
            </Button>
          </div>
          {form.auth === 'password' ? (
            <Input
              label="Senha"
              type="password"
              reveal
              autoComplete="off"
              value={form.password ?? ''}
              onChange={(e) => set('password', e.target.value)}
            />
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <Button type="button" variant="secondary" onClick={() => void pickKey()}>
                  Escolher a chave…
                </Button>
                <span className="min-w-0 truncate text-sm text-gray-400">
                  {form.keyPath ?? 'Nenhum arquivo escolhido'}
                </span>
              </div>
              <Input
                label="Senha da chave (se tiver)"
                type="password"
                reveal
                autoComplete="off"
                value={form.keyPassphrase ?? ''}
                onChange={(e) => set('keyPassphrase', e.target.value)}
              />
            </div>
          )}
          <Input
            label="Domínio próprio (opcional)"
            placeholder="salinha.meudominio.com"
            autoCapitalize="none"
            spellCheck={false}
            value={form.domain ?? ''}
            onChange={(e) => set('domain', e.target.value)}
          />
          <p className="-mt-2 text-xs text-gray-500">
            Sem domínio, o endereço fica https://IP-com-hífens.sslip.io (HTTPS grátis, sem comprar
            nada). Com domínio, aponte o registro A dele para o IP da VPS antes.
          </p>
          <label className="flex cursor-pointer items-start gap-2.5 text-sm text-gray-300">
            <input
              type="checkbox"
              className="mt-0.5 accent-[#5865f2]"
              checked={form.autoUpdate}
              onChange={(e) => set('autoUpdate', e.target.checked)}
            />
            <span>
              Atualizar sozinho quando sair versão nova{' '}
              <span className="text-gray-500">(de madrugada e fora de chamada)</span>
            </span>
          </label>
          <p className="text-xs text-gray-500">
            A senha só é usada agora, para instalar; ela não fica salva.
          </p>
          <Button type="submit" className="w-full py-2.5" disabled={!host || !canInstall}>
            Instalar na VPS
          </Button>
        </form>
        <p className="mt-4 text-sm text-gray-400">
          Já tem um endereço?{' '}
          <Link to="/conectar" className="font-medium text-violet-400 hover:underline">
            Entrar num servidor
          </Link>
          {' · '}
          <Link to="/" className="font-medium text-violet-400 hover:underline">
            Voltar
          </Link>
        </p>
      </AuthLayout>
    )
  }

  if (state.publicUrl) {
    const url = state.publicUrl
    return (
      <AuthLayout>
        <h1 className="text-2xl font-semibold text-gray-50">Servidor no ar!</h1>
        <p className="mb-6 mt-1 text-sm text-gray-400">
          Mande o endereço abaixo para quem vai entrar.
        </p>
        <div className="flex flex-col gap-2">
          <span className="text-ds-sm font-medium text-gray-300">Endereço do servidor</span>
          <div className="flex items-center gap-2">
            <code className="glass-input flex-1 select-all truncate font-mono text-gray-100">
              {url}
            </code>
            <Button type="button" variant="secondary" onClick={() => copyText(url)}>
              Copiar
            </Button>
          </div>
          <p className="text-xs text-gray-400">
            Quem for entrar escolhe <span className="text-gray-200">Entrar num servidor</span> e
            cola este endereço. Ele também fica em Configurações → Aplicativo.
          </p>
        </div>
        <Notes notes={state.notes} />
        <Button className="mt-6 w-full py-2.5" onClick={() => void host?.finish()}>
          Entrar no meu servidor
        </Button>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout>
      <h1 className="text-2xl font-semibold text-gray-50">Instalando na VPS</h1>
      <p className="mb-6 mt-1 text-sm text-gray-400">Leva poucos minutos. Não feche o app.</p>
      <Steps state={state} />
      <Notes notes={state.notes} />
      {state.hostKeyChanged && (
        <div className="mt-4 flex flex-col gap-3 rounded-lg border border-red-400/30 bg-red-500/15 px-3 py-3">
          <p className="text-sm text-red-300">
            A identidade desta VPS mudou desde a última instalação. Se você reinstalou o sistema da
            VPS, é esperado. Se não, alguém pode estar no meio da conexão: não continue.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="danger" onClick={() => void trustNewIdentity()} disabled={installing}>
              Reinstalei a VPS: continuar
            </Button>
            <Button variant="ghost" onClick={() => setStarted(false)} disabled={installing}>
              Voltar
            </Button>
          </div>
        </div>
      )}
    </AuthLayout>
  )
}

export default HostServer
