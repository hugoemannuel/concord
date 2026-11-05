import { changeEmail, changeUsername } from '../api/account'
import { useProfileStore } from '../../profile/store/profileStore'
import type { PublicProfile } from '../../profile/api/users'
import { useAuthStore, type User } from './authStore'

// Ações da própria conta que gravam o usuário que o servidor devolveu.

/** Grava a conta nova. O status é o escolhido nesta sessão: o local manda. */
export function commitMe(latest: User): void {
  const { user: current, setUser } = useAuthStore.getState()
  setUser({ ...latest, status: current?.status ?? latest.status })
  useProfileStore.getState().apply(latest as unknown as PublicProfile)
}

export async function changeMyUsername(username: string, password: string): Promise<void> {
  commitMe(await changeUsername(username, password))
}

export async function changeMyEmail(email: string, password: string): Promise<void> {
  commitMe(await changeEmail(email, password))
}
