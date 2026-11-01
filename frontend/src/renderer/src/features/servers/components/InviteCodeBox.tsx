import { useEffect, useState } from 'react'
import { getInviteCode, rotateInviteCode } from '../api/servers'
import { showToast } from '../../../shared/store/toastStore'
import { useInviteCodeStore } from '../store/inviteCodeStore'
import { inviteLink } from '../lib/inviteLink'
import { actionErrorMessage } from '../lib/permissionErrors'
import Button from '../../../shared/ui/Button'
import { Skeleton } from '../../../shared/ui/skeleton/Skeleton'
import ConfirmModal from '../../friends/components/ConfirmModal'
import { ChevronRightIcon } from '../../../shared/ui/icons'
import { IS_WEB } from '../../../shared/lib/config'

/** No app web o link usa a própria origem (servidor próprio, sslip.io...). */
function linkFor(code: string): string {
  return IS_WEB ? inviteLink(code, location.origin) : inviteLink(code)
}

/** Link de convite do servidor para mandar aos amigos (entram sozinhos com ele). */
function InviteCodeBox({ serverId }: { serverId: string }): React.JSX.Element {
  // Do store: quando alguém gera um link novo (server:invite_code), este muda junto.
  const code = useInviteCodeStore((s) => s.codes[serverId] ?? null)
  const [confirmReset, setConfirmReset] = useState(false)

  useEffect(() => {
    let cancelled = false
    getInviteCode(serverId)
      .then(({ code }) => !cancelled && useInviteCodeStore.getState().set(serverId, code))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [serverId])

  const reset = async (): Promise<void> => {
    try {
      const { code } = await rotateInviteCode(serverId)
      useInviteCodeStore.getState().set(serverId, code)
      showToast.success('Link novo gerado. O anterior não funciona mais.')
    } catch (err) {
      showToast.error(actionErrorMessage(err, 'Não foi possível gerar um link novo.'))
    }
  }

  const link = code ? linkFor(code) : null

  const copy = (): void => {
    if (!link) return
    void navigator.clipboard
      .writeText(link)
      .then(() => showToast.success('Link copiado!'))
      .catch(() => showToast.error('Não foi possível copiar.'))
  }

  return (
    <div className="space-y-2 rounded-xl border border-subtle bg-fg/5 p-4">
      <p className="text-ds-sm font-medium text-muted">Link de convite</p>
      <div className="flex items-center gap-2">
        {link ? (
          <input
            readOnly
            aria-label="Link de convite"
            value={link}
            onFocus={(e) => e.currentTarget.select()}
            className="min-w-0 flex-1 truncate rounded-lg bg-input px-3 py-2 font-mono text-ds-sm text-strong outline-none focus:ring-2 focus:ring-brand/50"
          />
        ) : (
          // Mesma caixa do campo (py-2 + linha de 18px = 34px) enquanto o link chega.
          <div
            role="status"
            aria-label="Gerando link…"
            className="flex h-[34px] min-w-0 flex-1 items-center rounded-lg bg-input px-3"
          >
            <Skeleton className="h-3 w-4/5" />
          </div>
        )}
        <Button variant="success" onClick={copy} disabled={!link}>
          Copiar
        </Button>
      </div>
      <p className="text-ds-xs text-muted">
        Mande para seus amigos: o link abre no navegador ou no app. Também dá para colar o link (ou
        o código <code className="font-mono text-secondary">{code ?? '········'}</code>) em{' '}
        <strong>+</strong> <ChevronRightIcon size={12} className="inline align-[-1px]" />{' '}
        <strong>Entrar com código</strong>.
      </p>
      <button
        type="button"
        onClick={() => setConfirmReset(true)}
        disabled={!code}
        className="cursor-pointer text-ds-xs font-medium text-brand hover:text-strong hover:underline disabled:cursor-not-allowed disabled:opacity-50"
      >
        Gerar novo link
      </button>
      <ConfirmModal
        open={confirmReset}
        title="Gerar novo link?"
        confirmLabel="Gerar novo link"
        onConfirm={reset}
        onClose={() => setConfirmReset(false)}
      >
        O link atual para de funcionar na hora: quem ainda não entrou vai precisar do link novo.
        Quem já está no servidor continua nele.
      </ConfirmModal>
    </div>
  )
}

export default InviteCodeBox
