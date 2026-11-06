import { errorMessage } from '../../../shared/lib/errorMessage'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { showToast } from '../../../shared/store/toastStore'
import { useCallStore } from '../../call/store/callStore'
import { joinWithAccount } from '../api/guestInvites'
import { alreadyMemberPath, guestErrorMessage } from '../lib/guestErrors'
import { visitPath } from '../lib/guestVisits'
import { useGuestLinkStore } from '../store/guestLinkStore'
import { useGuestVisitsStore } from '../store/guestVisitsStore'

/** Entra na call de um canal (a da visita); erro vira aviso. */
export function enterVisitCall(channelId: string): Promise<void> {
  return useCallStore
    .getState()
    .joinVoiceChannel(channelId)
    .catch((err: unknown) => {
      showToast.error(errorMessage(err, 'Não foi possível entrar na call.'))
    })
}

/**
 * Quem tem conta confirmou o link: vira uma visita (item no trilho), abre a
 * tela dela e entra na call. Já é membro: o caminho do canal no servidor.
 * Devolve para onde ir.
 */
export async function joinVisit(token: string): Promise<string> {
  try {
    const { pass } = await joinWithAccount(token)
    useGuestVisitsStore.getState().upsert(pass)
    void enterVisitCall(pass.channel_id)
    return visitPath(pass.server_id)
  } catch (err) {
    const memberPath = alreadyMemberPath(err)
    if (memberPath) return memberPath
    throw new Error(guestErrorMessage(err, 'Não foi possível entrar na call.'))
  }
}

export interface GuestVisitJoin {
  joining: boolean
  error: string | null
  join: () => Promise<void>
}

/** O botão "Entrar na call" da confirmação. */
export function useGuestVisitJoin(token: string): GuestVisitJoin {
  const navigate = useNavigate()
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const join = async (): Promise<void> => {
    setJoining(true)
    setError(null)
    try {
      const path = await joinVisit(token)
      useGuestLinkStore.getState().close()
      navigate(path)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setJoining(false)
    }
  }

  return { joining, error, join }
}
