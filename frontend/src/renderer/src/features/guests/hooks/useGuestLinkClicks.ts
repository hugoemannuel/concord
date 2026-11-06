import { useEffect } from 'react'
import { serverOrigins } from '../../servers/lib/appInviteLink'
import { guestTokenFromClick } from '../lib/guestLink'
import { useGuestLinkStore } from '../store/guestLinkStore'

/**
 * Link de visitante nosso clicado dentro do app (chat, DM...): pergunta aqui
 * mesmo se quer entrar como visitante (GuestVisitConfirmModal), com a conta
 * logada, em vez de abrir o navegador de fora ou sair do app.
 */
export function useGuestLinkClicks(): void {
  useEffect(() => {
    const origins = serverOrigins()
    const onClick = (e: MouseEvent): void => {
      const anchor = (e.target as Element | null)?.closest?.<HTMLAnchorElement>('a[href]')
      const href = anchor?.href ?? null
      const token = guestTokenFromClick(
        {
          href,
          button: e.button,
          ctrlKey: e.ctrlKey,
          metaKey: e.metaKey,
          shiftKey: e.shiftKey,
          defaultPrevented: e.defaultPrevented
        },
        origins
      )
      if (!token) return
      e.preventDefault()
      useGuestLinkStore.getState().open(token)
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [])
}
