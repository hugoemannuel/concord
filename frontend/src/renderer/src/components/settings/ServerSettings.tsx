import { useEffect, useState } from 'react'
import { copyText } from '../../lib/clipboard'
import { logoutAndReset } from '../../store/meActions'
import type { ServerInfo } from '../../../../shared/serverAddress'

/**
 * Configurações → Aplicativo → Servidor: a que servidor o app fala (o mesmo
 * endereço que se manda aos amigos) e "Trocar servidor". No build oficial o
 * servidor é fixo.
 */
function ServerSettings(): React.JSX.Element | null {
  const server = window.api?.server
  const [info, setInfo] = useState<ServerInfo | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    void server?.info().then(setInfo)
  }, [server])

  if (!server || !info?.url) return null
  const url = info.url

  const leave = async (): Promise<void> => {
    setLeaving(true)
    // Sai da conta antes: o login deste servidor não vale no próximo.
    await logoutAndReset()
    const ok = await server.forget().catch(() => false)
    if (!ok) setLeaving(false)
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <h3 className="mb-3 text-ds-sm font-medium text-gray-400">Servidor</h3>
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4">
          <span className="min-w-0">
            <span className="block text-ds-md font-medium text-white">Conectado a</span>
            <span className="block truncate font-mono text-ds-sm text-gray-400">{url}</span>
            {!info.fixed && (
              <span className="block text-ds-xs text-gray-500">
                Para chamar alguém, mande este endereço.
              </span>
            )}
          </span>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() => copyText(url)}
              className="cursor-pointer rounded-lg bg-[#5865f2] px-3 py-2 text-ds-sm font-medium text-white transition-colors hover:bg-[#4752c4]"
            >
              Copiar
            </button>
            {!info.fixed && !confirming && (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="cursor-pointer rounded-lg bg-white/10 px-3 py-2 text-ds-sm font-medium text-white transition-colors hover:bg-white/15"
              >
                Trocar servidor
              </button>
            )}
          </div>
        </div>
        {confirming && (
          <div className="flex flex-col gap-3 rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2">
            <p className="text-sm text-amber-200">
              Você vai sair da conta e o app volta para a tela inicial, onde dá para escolher outro
              servidor.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void leave()}
                disabled={leaving}
                className="cursor-pointer rounded-lg bg-[#f23f43] px-3 py-1.5 text-ds-sm font-medium text-white transition-colors hover:bg-[#d83a3e] disabled:cursor-default disabled:opacity-50"
              >
                {leaving ? 'Saindo…' : 'Sair e trocar'}
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={leaving}
                className="cursor-pointer rounded-lg bg-white/10 px-3 py-1.5 text-ds-sm font-medium text-white transition-colors hover:bg-white/15"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default ServerSettings
