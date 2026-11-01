import { useAuthStore } from '../../auth/store/authStore'
import { callController } from '../../call/lib/callRuntime'
import { pushRegistration } from '../../notifications/lib/pushSession'

/**
 * A sessão acabou no servidor (conta excluída ou saiu de todos os
 * dispositivos): sai da chamada, esquece o push deste aparelho e limpa os
 * tokens. Nada disso depende do servidor aceitar.
 */
export async function leaveDevice(): Promise<void> {
  await callController.leave().catch(() => {})
  await pushRegistration.forget().catch(() => {})
  await useAuthStore.getState().signOut()
}
