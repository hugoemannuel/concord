import { create } from 'zustand'
import router from '../../../app/router'
import { callRoute } from '../lib/callUtils'
import { needsLeaveConfirm, type LiveTarget } from '../lib/screenPreview'
import { waitUntil } from '../lib/screenPreviewFlow'
import { useCallStore } from './callStore'
import { showToast } from '../../../shared/store/toastStore'
import { errorMessage } from '../../../shared/lib/errorMessage'

// "Entrar na transmissão" do cartão de perfil: assiste à tela da pessoa pelo
// mesmo fluxo da call (watchScreen), entrando antes no canal de voz dela se
// preciso. Sair de outra chamada pede confirmação (StreamJoinHost).

/** Depois de entrar no canal, quanto esperar a tela aparecer no LiveKit. */
const SCREEN_WAIT_MS = 15_000

export interface StreamJoinRequest {
  userId: string
  /** Nome de quem transmite (na confirmação). */
  name: string
  target: LiveTarget
  /** Nome do canal de voz dela (na confirmação). */
  channelName?: string
}

interface StreamJoinState {
  /** Esperando confirmar a saída da chamada atual. */
  pending: StreamJoinRequest | null
  ask: (req: StreamJoinRequest) => void
  close: () => void
}

export const useStreamJoinStore = create<StreamJoinState>()((set) => ({
  pending: null,
  ask: (pending) => set({ pending }),
  close: () => set({ pending: null })
}))

function openCallView(): void {
  const s = useCallStore.getState()
  const route = callRoute({
    type: s.type,
    serverId: s.serverId,
    channelId: s.channelId,
    peerId: s.participants[0]?.id ?? null
  })
  if (route) void router.navigate(route)
}

/** Assiste (e foca) quando a tela dela estiver disponível na chamada atual. */
async function watchWhenReady(userId: string, channelId: string | null): Promise<void> {
  const ready = await waitUntil(
    useCallStore,
    (s) => {
      if (s.status === 'idle' || (channelId !== null && s.channelId !== channelId)) return null
      return s.status === 'active' && s.availableScreens.includes(userId)
    },
    SCREEN_WAIT_MS
  )
  const s = useCallStore.getState()
  if (!ready) {
    if (s.status === 'active') showToast.error('A transmissão não está mais disponível.')
    return
  }
  if (!s.watchedScreenIds.includes(userId)) s.watchScreen(userId)
  useCallStore.getState().focusWatchedScreen(userId)
}

/** Entra no canal de voz dela. false = falhou (já avisou) ou não ficou no canal. */
async function joinStreamChannel(channelId: string): Promise<boolean> {
  try {
    const s = useCallStore.getState()
    // Canal de voz trocando de canal já sai sozinho; DM precisa sair antes.
    if (s.status !== 'idle' && s.type === 'dm') s.endCall()
    await useCallStore.getState().joinVoiceChannel(channelId)
  } catch (err) {
    showToast.error(errorMessage(err, 'Falha ao entrar no canal de voz.'))
    return false
  }
  const s = useCallStore.getState()
  // Sala trancou no meio do caminho: virou pedido para entrar (a UI do pedido assume).
  return s.status !== 'idle' && s.channelId === channelId
}

/** Faz o que o botão pede, sem perguntar nada. */
export async function startWatchingStream(req: StreamJoinRequest): Promise<void> {
  const { target, userId } = req
  if (target.kind === 'join' && !(await joinStreamChannel(target.channelId))) return
  openCallView()
  await watchWhenReady(userId, target.kind === 'join' ? target.channelId : null)
}

/** Clique em "Entrar na transmissão": pergunta antes de sair de outra chamada. */
export function requestWatchStream(req: StreamJoinRequest): void {
  if (
    req.target.kind === 'join' &&
    needsLeaveConfirm(useCallStore.getState(), req.target.channelId)
  ) {
    useStreamJoinStore.getState().ask(req)
    return
  }
  void startWatchingStream(req)
}
