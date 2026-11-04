import { useState } from 'react'
import { resendVerification } from '../../auth/api/auth'
import { useAuthStore } from '../../auth/store/authStore'
import { getMe } from '../../profile/api/users'
import { showToast } from '../../../shared/store/toastStore'
import { joinServerByCode } from '../api/servers'
import { inviteErrorMessage } from '../lib/invitePreview'
import { useServerStore } from '../store/serverStore'

export interface InviteJoin {
  joining: boolean
  joinError: string | null
  /** Banido: tentar de novo não adianta, então some o "Aceitar". */
  banned: boolean
  checking: boolean
  notice: string | null
  accept: () => Promise<void>
  resend: () => Promise<void>
  recheckEmail: () => Promise<void>
}

/** Relê a conta: a que está em memória pode estar velha quanto ao e-mail. */
async function refreshMe(): Promise<ReturnType<typeof useAuthStore.getState>['user']> {
  const fresh = await getMe()
  useAuthStore.getState().setUser(fresh)
  return fresh
}

/** Entrar pelo convite e o caminho do e-mail não confirmado. */
export function useInviteJoin(code: string, onJoined: (serverId: string) => void): InviteJoin {
  const [joining, setJoining] = useState(false)
  const [joinError, setJoinError] = useState<string | null>(null)
  const [banned, setBanned] = useState(false)
  const [checking, setChecking] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const onJoinFailed = (err: unknown): void => {
    setJoinError(inviteErrorMessage(err))
    const errorCode = (err as { code?: unknown }).code
    setBanned(errorCode === 'banned')
    // A conta em memória dizia confirmada, mas o servidor não: relê.
    if (errorCode === 'email_not_verified') void refreshMe().catch(() => {})
    setJoining(false)
  }

  return {
    joining,
    joinError,
    banned,
    checking,
    notice,
    accept: async () => {
      setJoining(true)
      setJoinError(null)
      try {
        const server = await joinServerByCode(code)
        await useServerStore.getState().fetchServers()
        showToast.success(`Você entrou em "${server.name}"!`)
        onJoined(server.id)
      } catch (err) {
        onJoinFailed(err)
      }
    },
    resend: async () => {
      setJoinError(null)
      try {
        const { sent } = await resendVerification()
        const email = useAuthStore.getState().user?.email
        setNotice(sent ? `Enviamos um novo e-mail para ${email}.` : 'Seu e-mail já está confirmado.')
      } catch (err) {
        setJoinError(inviteErrorMessage(err))
      }
    },
    // Confirmou o e-mail em outra aba: relê a conta para liberar o "Aceitar".
    recheckEmail: async () => {
      setChecking(true)
      setJoinError(null)
      setNotice(null)
      try {
        const fresh = await refreshMe()
        if (fresh?.email_verified === false) setJoinError('Seu e-mail ainda não foi confirmado.')
      } catch (err) {
        setJoinError(inviteErrorMessage(err))
      } finally {
        setChecking(false)
      }
    }
  }
}
