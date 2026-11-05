import { useEffect } from 'react'
import { serverOrigins } from '../lib/appInviteLink'
import { inviteCodeFromClick } from '../lib/inviteClick'
import { useInviteLinkStore } from '../store/inviteLinkStore'

/**
 * Clicar num link de convite (chat, bio de perfil, qualquer <a>) com o app já
 * aberto mostra a confirmação aqui, em vez de abrir o navegador que só
 * redirecionaria de volta. Escuta o documento na fase de captura para valer
 * para qualquer link, sem cada tela precisar tratar. Só roda dentro do app
 * logado (o InviteConfirmModal mora no AppShell).
 */
export function useInviteLinkClicks(): void {
  useEffect(() => {
    const onClick = (e: MouseEvent): void => {
      const anchor = e.target instanceof Element ? e.target.closest('a[href]') : null
      const code = inviteCodeFromClick(
        {
          href: anchor instanceof HTMLAnchorElement ? anchor.href : null,
          button: e.button,
          ctrlKey: e.ctrlKey,
          metaKey: e.metaKey,
          shiftKey: e.shiftKey,
          altKey: e.altKey,
          defaultPrevented: e.defaultPrevented
        },
        serverOrigins()
      )
      if (!code) return
      e.preventDefault()
      useInviteLinkStore.getState().open(code)
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [])
}
