import { ApiError } from '../../../shared/api/client'
import { useCallNoticeStore } from '../store/callNoticeStore'
import { useCallSessionStore } from '../store/callSessionStore'
import { useIncomingCallStore } from '../store/incomingCallStore'
import { useParticipantsStore, voiceOf } from '../store/participantsStore'
import { useCameraStore } from '../store/cameraStore'
import { useScreenShareStore } from '../store/screenShareStore'
import { useSpeakingStore } from '../store/speakingStore'
import { useUserAudioStore } from '../store/userAudioStore'
import type { CallMedia, MediaConnection } from './callMedia'
import { createCallController, type ControllerDeps } from './callController'

import { playSound } from './sounds/soundPlayer'

jest.mock('./sounds/soundPlayer', () => ({ playSound: jest.fn() }))

const ana = { id: 'u1', username: 'ana', display_name: 'Ana' }
const session = () => useCallSessionStore.getState()

function rig(over: Partial<ControllerDeps> = {}) {
  let connection: (s: MediaConnection) => void = () => {}
  let speakers: (ids: string[]) => void = () => {}
  let screens: (ids: string[]) => void = () => {}
  let peers: (p: Record<string, string>) => void = () => {}
  let cameras: (ids: string[]) => void = () => {}
  const media: jest.Mocked<CallMedia> = {
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
    setMicEnabled: jest.fn().mockResolvedValue(undefined),
    setListening: jest.fn(),
    setUserVolume: jest.fn(),
    setScreenShareEnabled: jest.fn().mockResolvedValue(undefined),
    setCameraEnabled: jest.fn().mockResolvedValue(undefined),
    flipCamera: jest.fn().mockResolvedValue(undefined),
    onCameras: jest.fn((l) => {
      cameras = l
      return () => {}
    }),
    watchScreen: jest.fn(),
    onScreens: jest.fn((l) => {
      screens = l
      return () => {}
    }),
    onPeers: jest.fn((l) => {
      peers = l
      return () => {}
    }),
    onSpeakers: jest.fn((l) => {
      speakers = l
      return () => {}
    }),
    onConnection: jest.fn((l) => {
      connection = l
      return () => {}
    })
  }
  const deps: ControllerDeps = {
    api: {
      startCall: jest.fn().mockResolvedValue({ id: 'c1', type: 'channel', status: 'active' }),
      getCallToken: jest.fn().mockResolvedValue({ token: 'tok' }),
      endCallRequest: jest.fn().mockResolvedValue({ message: 'ok' }),
      getCallState: jest.fn().mockResolvedValue({ call: { id: 'c1', status: 'active' }, participants: [] })
    },
    media,
    ws: { send: jest.fn(), subscribe: jest.fn(), unsubscribe: jest.fn() },
    liveKitUrl: 'wss://sala.exemplo',
    controls: () => ({ muted: false, deafened: false }),
    ensureMicPermission: jest.fn().mockResolvedValue(true),
    ensureCameraPermission: jest.fn().mockResolvedValue(true),
    ...over
  }
  return { deps, media, controller: createCallController(deps), emitConnection: (s: MediaConnection) => connection(s), emitSpeakers: (ids: string[]) => speakers(ids), emitScreens: (ids: string[]) => screens(ids), emitPeers: (p: Record<string, string>) => peers(p), emitCameras: (ids: string[]) => cameras(ids) }
}

beforeEach(() => {
  session().reset()
  useParticipantsStore.getState().reset()
  useIncomingCallStore.getState().clear()
  useCallNoticeStore.getState().dismiss()
  useSpeakingStore.getState().reset()
  useScreenShareStore.getState().reset()
  useCameraStore.getState().reset()
})

describe('joinChannel', () => {
  it('cria a chamada, assina a sala, conecta a mídia e fica ativa', async () => {
    const { controller, deps, media } = rig()
    await controller.joinChannel({ id: 'ch1', name: 'Geral', serverId: 's1' })
    expect(deps.api.startCall).toHaveBeenCalledWith({ type: 'channel', channel_id: 'ch1' })
    expect(deps.ws.subscribe).toHaveBeenCalledWith('call:c1')
    expect(media.connect).toHaveBeenCalledWith('wss://sala.exemplo', 'tok')
    expect(session()).toMatchObject({ phase: 'active', callId: 'c1', kind: 'channel', channelId: 'ch1', serverId: 's1', name: 'Geral' })
  })

  it('entrar numa chamada que já tem gente mostra quem está nela, com o estado de mudo (bug: a lista só vinha por evento)', async () => {
    const { controller, deps } = rig({ meId: () => 'me' })
    ;(deps.api.getCallState as jest.Mock).mockResolvedValue({
      call: { id: 'c1', status: 'active' },
      participants: [
        { user_id: 'me', display_name: 'Eu' },
        { user_id: 'u1', username: 'ana', display_name: 'Ana', avatar_url: null, muted: true }
      ]
    })
    await controller.joinChannel({ id: 'ch1', name: 'Geral', serverId: 's1' })
    expect(deps.api.getCallState).toHaveBeenCalledWith('c1')
    expect(useParticipantsStore.getState().people).toEqual([{ id: 'u1', username: 'ana', display_name: 'Ana', avatar_url: null }])
    expect(voiceOf(useParticipantsStore.getState().voice, 'u1').muted).toBe(true)
  })

  it('falha ao buscar quem está na chamada não impede de entrar', async () => {
    const { controller, deps } = rig()
    ;(deps.api.getCallState as jest.Mock).mockRejectedValue(new Error('sem rede'))
    await controller.joinChannel({ id: 'ch1', name: 'Geral', serverId: 's1' })
    expect(session().phase).toBe('active')
  })

  it('liga o microfone conforme o mudo local e avisa o servidor', async () => {
    const { controller, deps, media } = rig({ controls: () => ({ muted: true, deafened: false }) })
    await controller.joinChannel({ id: 'ch1', name: 'Geral', serverId: 's1' })
    expect(media.setMicEnabled).toHaveBeenLastCalledWith(false)
    expect(deps.ws.send).toHaveBeenCalledWith('call:voice', { call_id: 'c1', muted: true, deafened: false })
  })

  it('sala trancada: avisa e volta a ocioso sem conectar', async () => {
    const { controller, media, deps } = rig()
    ;(deps.api.startCall as jest.Mock).mockRejectedValue(new ApiError(423, 'call_locked'))
    await controller.joinChannel({ id: 'ch1', name: 'Geral', serverId: 's1' })
    expect(session().phase).toBe('idle')
    expect(media.connect).not.toHaveBeenCalled()
    expect(useCallNoticeStore.getState().message).toBe('Sala trancada. Peça para alguém abrir.')
  })

  it('falha da mídia sai da chamada e avisa', async () => {
    const { controller, media, deps } = rig()
    media.connect.mockRejectedValue(new Error('sem rede'))
    await controller.joinChannel({ id: 'ch1', name: 'Geral', serverId: 's1' })
    expect(session().phase).toBe('idle')
    expect(deps.ws.send).toHaveBeenCalledWith('call:leave', { call_id: 'c1' })
    expect(useCallNoticeStore.getState().message).toBe('Não foi possível entrar na chamada. Tente de novo.')
  })

  it('permissão de microfone negada: entra mudo e avisa', async () => {
    const { controller, media } = rig({ ensureMicPermission: jest.fn().mockResolvedValue(false) })
    await controller.joinChannel({ id: 'ch1', name: 'Geral', serverId: 's1' })
    expect(session().phase).toBe('active')
    expect(media.setMicEnabled).toHaveBeenLastCalledWith(false)
    expect(useCallNoticeStore.getState().message).toBe('Sem permissão do microfone. Você entrou mudo.')
  })

  // Regressão: o app fechava ao entrar no canal. A fase "connecting" ligava o serviço em primeiro plano de
  // microfone antes de pedir a permissão, e o Android 14 derruba o app (SecurityException) quando o serviço de
  // microfone sobe sem RECORD_AUDIO. A permissão agora vem antes de qualquer fase da chamada.
  it('pede o microfone antes de entrar em qualquer fase da chamada (canal, DM e atender)', async () => {
    const phases: string[] = []
    const { controller, deps } = rig({
      ensureMicPermission: jest.fn(async () => {
        phases.push(session().phase)
        return true
      })
    })
    await controller.joinChannel({ id: 'ch1', name: 'Geral', serverId: 's1' })
    await controller.leave()
    await controller.callDm({ id: 'dm1', name: 'Ana' })
    await controller.leave()
    useIncomingCallStore.getState().ring({ callId: 'c9', conversationId: 'dm1', initiator: ana })
    await controller.acceptIncoming()
    expect(phases).toEqual(['idle', 'idle', 'idle'])
    expect(deps.ensureMicPermission).toHaveBeenCalledTimes(3)
  })

  it('microfone negado já fica marcado ao começar a chamada (o serviço de microfone não sobe)', async () => {
    let deniedAtStart: boolean | null = null
    const { controller, deps } = rig({ ensureMicPermission: jest.fn().mockResolvedValue(false) })
    ;(deps.api.startCall as jest.Mock).mockImplementation(async () => {
      deniedAtStart = session().micDenied
      return { id: 'c1', type: 'channel', status: 'active' }
    })
    await controller.joinChannel({ id: 'ch1', name: 'Geral', serverId: 's1' })
    expect(deniedAtStart).toBe(true)
    expect(session().micDenied).toBe(true)
  })

  it('entrar no mesmo canal de novo não faz nada', async () => {
    const { controller, deps } = rig()
    await controller.joinChannel({ id: 'ch1', name: 'Geral', serverId: 's1' })
    await controller.joinChannel({ id: 'ch1', name: 'Geral', serverId: 's1' })
    expect(deps.api.startCall).toHaveBeenCalledTimes(1)
  })

  it('entrar em outro canal sai do anterior primeiro', async () => {
    const { controller, deps } = rig()
    await controller.joinChannel({ id: 'ch1', name: 'Geral', serverId: 's1' })
    ;(deps.api.startCall as jest.Mock).mockResolvedValue({ id: 'c2', type: 'channel', status: 'active' })
    await controller.joinChannel({ id: 'ch2', name: 'Jogos', serverId: 's1' })
    expect(deps.ws.send).toHaveBeenCalledWith('call:leave', { call_id: 'c1' })
    expect(session()).toMatchObject({ callId: 'c2', channelId: 'ch2' })
  })
})

describe('callDm / accept / decline', () => {
  it('ligar para DM fica chamando sem conectar a mídia', async () => {
    const { controller, media, deps } = rig()
    ;(deps.api.startCall as jest.Mock).mockResolvedValue({ id: 'd1', type: 'dm', status: 'ringing' })
    await controller.callDm({ id: 'cv1', name: 'Ana' })
    expect(deps.api.startCall).toHaveBeenCalledWith({ type: 'dm', conversation_id: 'cv1' })
    expect(session()).toMatchObject({ phase: 'outgoing', callId: 'd1', kind: 'dm', conversationId: 'cv1', name: 'Ana' })
    expect(media.connect).not.toHaveBeenCalled()
  })

  it('quando atendem (fase connecting) a mídia conecta', async () => {
    const { controller, media, deps } = rig()
    ;(deps.api.startCall as jest.Mock).mockResolvedValue({ id: 'd1', type: 'dm', status: 'ringing' })
    await controller.callDm({ id: 'cv1', name: 'Ana' })
    session().setPhase('connecting')
    await controller.connectIfNeeded()
    expect(media.connect).toHaveBeenCalled()
    expect(session().phase).toBe('active')
  })

  it('atender: avisa o servidor, assina a sala e conecta', async () => {
    const { controller, deps, media } = rig()
    useIncomingCallStore.getState().ring({ callId: 'd9', conversationId: 'cv1', initiator: ana })
    await controller.acceptIncoming()
    expect(deps.ws.send).toHaveBeenCalledWith('call:accept', { call_id: 'd9' })
    expect(deps.ws.subscribe).toHaveBeenCalledWith('call:d9')
    expect(media.connect).toHaveBeenCalled()
    expect(useIncomingCallStore.getState().call).toBeNull()
    expect(session()).toMatchObject({ callId: 'd9', kind: 'dm', name: 'Ana', phase: 'active' })
  })

  it('aceitar em call sai da antiga antes do aceite (o WS entrega em ordem: sem fantasma se o aceite falhar)', async () => {
    const { controller, deps } = rig()
    await controller.joinChannel({ id: 'ch1', name: 'Geral', serverId: 's1' })
    useIncomingCallStore.getState().ring({ callId: 'd9', conversationId: 'cv1', initiator: ana })
    ;(deps.ws.send as jest.Mock).mockClear()
    await controller.acceptIncoming()
    const sent = (deps.ws.send as jest.Mock).mock.calls.map((c) => c[0])
    expect(sent.slice(0, 2)).toEqual(['call:leave', 'call:accept'])
    expect(deps.ws.send).toHaveBeenCalledWith('call:leave', { call_id: 'c1' })
    expect(session()).toMatchObject({ callId: 'd9', kind: 'dm' })
  })

  it('ligar em call e o servidor recusar: sai de verdade da call antiga (sem fantasma no canal)', async () => {
    const { controller, deps } = rig()
    await controller.joinChannel({ id: 'ch1', name: 'Geral', serverId: 's1' })
    ;(deps.api.startCall as jest.Mock).mockRejectedValue(new Error('bloqueado'))
    await controller.callDm({ id: 'cv1', name: 'Ana' })
    expect(deps.ws.send).toHaveBeenCalledWith('call:leave', { call_id: 'c1' })
  })

  it('ligar em call não manda call:leave (o servidor já tira) e fica chamando', async () => {
    const { controller, deps } = rig()
    await controller.joinChannel({ id: 'ch1', name: 'Geral', serverId: 's1' })
    ;(deps.api.startCall as jest.Mock).mockResolvedValue({ id: 'd1', type: 'dm', status: 'ringing' })
    await controller.callDm({ id: 'cv1', name: 'Ana' })
    expect(deps.ws.send).not.toHaveBeenCalledWith('call:leave', expect.anything())
    expect(session()).toMatchObject({ phase: 'outgoing', callId: 'd1', kind: 'dm' })
  })

  it('recusar avisa o servidor e limpa', () => {
    const { controller, deps } = rig()
    useIncomingCallStore.getState().ring({ callId: 'd9', conversationId: 'cv1', initiator: ana })
    controller.declineIncoming()
    expect(deps.ws.send).toHaveBeenCalledWith('call:decline', { call_id: 'd9' })
    expect(useIncomingCallStore.getState().call).toBeNull()
  })
})

describe('leave e mídia', () => {
  it('toca o som de entrar ao conectar e o de sair ao sair da chamada ativa', async () => {
    const { controller } = rig()
    jest.mocked(playSound).mockClear()
    await controller.joinChannel({ id: 'ch1', name: 'Geral', serverId: 's1' })
    expect(playSound).toHaveBeenCalledWith('join')
    await controller.leave()
    expect(playSound).toHaveBeenLastCalledWith('leave')
  })

  it('sair de uma chamada que nem conectou não toca o som de sair', async () => {
    const { controller } = rig()
    await controller.callDm({ id: 'cv1', name: 'Ana' })
    jest.mocked(playSound).mockClear()
    await controller.leave()
    expect(playSound).not.toHaveBeenCalled()
  })

  it('sair avisa, desassina, desconecta e zera tudo', async () => {
    const { controller, deps, media } = rig()
    await controller.joinChannel({ id: 'ch1', name: 'Geral', serverId: 's1' })
    useParticipantsStore.getState().upsert(ana)
    await controller.leave()
    expect(deps.ws.send).toHaveBeenCalledWith('call:leave', { call_id: 'c1' })
    expect(deps.ws.unsubscribe).toHaveBeenCalledWith('call:c1')
    expect(media.disconnect).toHaveBeenCalled()
    expect(session().phase).toBe('idle')
    expect(useParticipantsStore.getState().people).toEqual([])
  })

  it('sair sem chamada não faz nada', async () => {
    const { controller, deps } = rig()
    await controller.leave()
    expect(deps.ws.send).not.toHaveBeenCalled()
  })

  it('mídia reconectando e voltando muda a fase', async () => {
    const { controller, emitConnection } = rig()
    await controller.joinChannel({ id: 'ch1', name: 'Geral', serverId: 's1' })
    emitConnection('reconnecting')
    expect(session().phase).toBe('reconnecting')
    emitConnection('connected')
    expect(session().phase).toBe('active')
  })

  it('mídia desconectada de vez encerra com aviso', async () => {
    const { controller, emitConnection } = rig()
    await controller.joinChannel({ id: 'ch1', name: 'Geral', serverId: 's1' })
    emitConnection('disconnected')
    await Promise.resolve()
    expect(session().phase).toBe('idle')
    expect(useCallNoticeStore.getState().message).toBe('A conexão com a chamada caiu.')
  })

  // Regressão (mesma conta no celular e no desktop): o aparelho substituído chamava leave() e mandava call:leave, que
  // tirava da chamada a conta inteira, inclusive o aparelho que acabou de entrar; os dois ficavam se derrubando.
  it('substituído por outro aparelho da mesma conta: sai sem avisar o servidor e explica', async () => {
    const { controller, emitConnection, deps, media } = rig()
    await controller.joinChannel({ id: 'ch1', name: 'Geral', serverId: 's1' })
    jest.mocked(deps.ws.send).mockClear()
    emitConnection('replaced')
    await Promise.resolve()
    expect(session().phase).toBe('idle')
    expect(deps.ws.send).not.toHaveBeenCalledWith('call:leave', expect.anything())
    expect(media.disconnect).toHaveBeenCalled()
    expect(useCallNoticeStore.getState().message).toBe('Você entrou nesta chamada em outro aparelho.')
  })

  it('quem fala vai para a store', async () => {
    const { controller, emitSpeakers } = rig()
    await controller.joinChannel({ id: 'ch1', name: 'Geral', serverId: 's1' })
    emitSpeakers(['u1'])
    expect(useSpeakingStore.getState().speaking).toEqual(['u1'])
  })
})

describe('applyAudio', () => {
  it('fone liga/desliga o áudio que chega e o microfone', async () => {
    let deafened = false
    const { controller, media, deps } = rig({ controls: () => ({ muted: deafened, deafened }) })
    await controller.joinChannel({ id: 'ch1', name: 'Geral', serverId: 's1' })
    deafened = true
    await controller.applyAudio()
    expect(media.setListening).toHaveBeenLastCalledWith(false)
    expect(media.setMicEnabled).toHaveBeenLastCalledWith(false)
    expect(deps.ws.send).toHaveBeenLastCalledWith('call:voice', { call_id: 'c1', muted: true, deafened: true })
  })

  it('sem chamada não faz nada', async () => {
    const { controller, media } = rig()
    await controller.applyAudio()
    expect(media.setMicEnabled).not.toHaveBeenCalled()
  })
})

describe('quem está na sala de mídia', () => {
  it('o Maestro (só existe na mídia) aparece na chamada e some quando sai (bug: o app só mostrava o que vinha do backend)', async () => {
    const { controller, emitPeers } = rig({ meId: () => 'me' })
    await controller.joinChannel({ id: 'ch1', name: 'Geral', serverId: 's1' })
    emitPeers({ me: 'Eu', 'bot-music:ch1': 'Maestro' })
    expect(useParticipantsStore.getState().people).toEqual([{ id: 'bot-music:ch1', username: '', display_name: 'Maestro', avatar_url: null, is_bot: true }])
    emitPeers({ me: 'Eu' })
    expect(useParticipantsStore.getState().people).toEqual([])
  })

  it('sem chamada (ocioso) o que chega da mídia é ignorado', () => {
    const { emitPeers } = rig({ meId: () => 'me' })
    emitPeers({ u9: 'Fantasma' })
    expect(useParticipantsStore.getState().people).toEqual([])
  })
})

describe('câmera', () => {
  it('ligar pede a permissão, liga a câmera e guarda o estado; tocar de novo desliga', async () => {
    const { controller, media, deps } = rig()
    await controller.joinChannel({ id: 'ch1', name: 'Geral', serverId: 's1' })
    await controller.toggleCamera()
    expect(deps.ensureCameraPermission).toHaveBeenCalled()
    expect(media.setCameraEnabled).toHaveBeenLastCalledWith(true)
    expect(useCameraStore.getState().on).toBe(true)
    await controller.toggleCamera()
    expect(media.setCameraEnabled).toHaveBeenLastCalledWith(false)
    expect(useCameraStore.getState().on).toBe(false)
  })

  it('sem permissão da câmera: avisa e não liga', async () => {
    const { controller, media } = rig({ ensureCameraPermission: jest.fn().mockResolvedValue(false) })
    await controller.joinChannel({ id: 'ch1', name: 'Geral', serverId: 's1' })
    await controller.toggleCamera()
    expect(media.setCameraEnabled).not.toHaveBeenCalled()
    expect(useCameraStore.getState().on).toBe(false)
    expect(useCallNoticeStore.getState().message).toMatch(/câmera/)
  })

  it('falha ao ligar: avisa, fica desligada e libera o que tiver começado', async () => {
    const { controller, media } = rig()
    await controller.joinChannel({ id: 'ch1', name: 'Geral', serverId: 's1' })
    media.setCameraEnabled.mockRejectedValueOnce(new Error('camera busy'))
    await controller.toggleCamera()
    expect(useCameraStore.getState().on).toBe(false)
    expect(media.setCameraEnabled).toHaveBeenLastCalledWith(false)
    expect(useCallNoticeStore.getState().message).toMatch(/câmera/)
  })

  it('quem está com a câmera ligada vai para a store; trocar de câmera chama a mídia', async () => {
    const { controller, media, emitCameras } = rig()
    emitCameras(['u1', 'me'])
    expect(useCameraStore.getState().cameras).toEqual(['u1', 'me'])
    await controller.flipCamera()
    expect(media.flipCamera).toHaveBeenCalled()
  })

  it('sair com a câmera ligada desliga antes de desconectar e zera o estado', async () => {
    const { controller, media } = rig()
    await controller.joinChannel({ id: 'ch1', name: 'Geral', serverId: 's1' })
    await controller.toggleCamera()
    media.setCameraEnabled.mockClear()
    await controller.leave()
    expect(media.setCameraEnabled).toHaveBeenCalledWith(false)
    expect(media.setCameraEnabled.mock.invocationCallOrder[0]).toBeLessThan(media.disconnect.mock.invocationCallOrder.at(-1) as number)
    expect(useCameraStore.getState()).toMatchObject({ on: false, cameras: [] })
  })
})

describe('transmissão de tela', () => {
  it('ligar e desligar a minha transmissão: avisa a mídia, guarda o estado e toca o som ao ligar', async () => {
    const { controller, media } = rig()
    await controller.toggleScreenShare()
    expect(media.setScreenShareEnabled).toHaveBeenLastCalledWith(true)
    expect(useScreenShareStore.getState().sharing).toBe(true)
    expect(playSound).toHaveBeenLastCalledWith('liveStart')
    await controller.toggleScreenShare()
    expect(media.setScreenShareEnabled).toHaveBeenLastCalledWith(false)
    expect(useScreenShareStore.getState().sharing).toBe(false)
  })

  // Regressão: o app transmitia sem avisar o servidor; quem clicava em "Assistir transmissão" recebia call:error e caía.
  it('avisa o servidor (call:screen) ao começar e ao parar de transmitir, como o desktop', async () => {
    const { controller, deps } = rig()
    await controller.joinChannel({ id: 'ch1', name: 'Geral', serverId: 's1' })
    await controller.toggleScreenShare()
    expect(deps.ws.send).toHaveBeenCalledWith('call:screen', { call_id: 'c1', active: true })
    await controller.toggleScreenShare()
    expect(deps.ws.send).toHaveBeenLastCalledWith('call:screen', { call_id: 'c1', active: false })
  })

  it('transmissão que falhou não é anunciada ao servidor', async () => {
    const { controller, deps, media } = rig()
    await controller.joinChannel({ id: 'ch1', name: 'Geral', serverId: 's1' })
    media.setScreenShareEnabled.mockRejectedValueOnce(new Error('NotAllowedError'))
    await controller.toggleScreenShare()
    expect(deps.ws.send).not.toHaveBeenCalledWith('call:screen', { call_id: 'c1', active: true })
  })

  it('captura de tela negada: avisa e fica desligada', async () => {
    const { controller, media } = rig()
    media.setScreenShareEnabled.mockRejectedValue(new Error('NotAllowedError'))
    await controller.toggleScreenShare()
    expect(useScreenShareStore.getState().sharing).toBe(false)
    expect(useCallNoticeStore.getState().message).toMatch(/Não foi possível transmitir a tela/)
  })

  it('captura que falhou no meio (a chamada caiu ao pedir a tela): manda desligar a captura para não deixar o serviço de tela preso', async () => {
    const { controller, media } = rig()
    media.setScreenShareEnabled.mockRejectedValueOnce(new Error('publish aborted'))
    await controller.toggleScreenShare()
    expect(media.setScreenShareEnabled).toHaveBeenNthCalledWith(1, true)
    expect(media.setScreenShareEnabled).toHaveBeenNthCalledWith(2, false)
  })

  it('sair da chamada transmitindo desliga a captura antes de desconectar', async () => {
    const { controller, media } = rig()
    await controller.joinChannel({ id: 'ch1', name: 'Geral', serverId: 's1' })
    await controller.toggleScreenShare()
    media.setScreenShareEnabled.mockClear()
    await controller.leave()
    expect(media.setScreenShareEnabled).toHaveBeenCalledWith(false)
    expect(media.setScreenShareEnabled.mock.invocationCallOrder[0]).toBeLessThan(media.disconnect.mock.invocationCallOrder.at(-1) as number)
  })

  it('a lista de quem transmite vai para a store; som quando outra pessoa começa ou para (eu não conto)', async () => {
    const { emitScreens } = rig({ meId: () => 'me' })
    jest.mocked(playSound).mockClear()
    emitScreens(['me'])
    expect(playSound).not.toHaveBeenCalled()
    emitScreens(['me', 'u1'])
    expect(playSound).toHaveBeenLastCalledWith('liveStart')
    emitScreens(['me'])
    expect(playSound).toHaveBeenLastCalledWith('liveEnd')
    expect(useScreenShareStore.getState().sharers).toEqual(['me'])
  })

  it('assistir pede a faixa à mídia; trocar de transmissão larga a anterior; parar zera', () => {
    const { controller, media } = rig()
    controller.watchScreen('u1')
    expect(media.watchScreen).toHaveBeenLastCalledWith('u1', true)
    expect(useScreenShareStore.getState().watching).toBe('u1')
    controller.watchScreen('u2')
    expect(media.watchScreen).toHaveBeenCalledWith('u1', false)
    expect(media.watchScreen).toHaveBeenLastCalledWith('u2', true)
    controller.watchScreen(null)
    expect(media.watchScreen).toHaveBeenLastCalledWith('u2', false)
    expect(useScreenShareStore.getState().watching).toBeNull()
  })

  it('sair da chamada zera as transmissões', async () => {
    const { controller } = rig()
    await controller.joinChannel({ id: 'ch1', name: 'Geral', serverId: 's1' })
    useScreenShareStore.getState().setSharing(true)
    await controller.leave()
    expect(useScreenShareStore.getState().sharing).toBe(false)
  })
})

// Pedido do dono: não dava para abaixar nem silenciar o som de outra pessoa da chamada no app.
describe('volume de cada pessoa (só para mim)', () => {
  beforeEach(() => useUserAudioStore.getState().reset())

  it('abaixar e silenciar alguém mudam o volume dessa pessoa na mídia', () => {
    const { media } = rig()
    useUserAudioStore.getState().setVolume('u1', 0.3)
    expect(media.setUserVolume).toHaveBeenLastCalledWith('u1', 0.3)
    useUserAudioStore.getState().toggleMuted('u1')
    expect(media.setUserVolume).toHaveBeenLastCalledWith('u1', 0)
    useUserAudioStore.getState().toggleMuted('u1')
    expect(media.setUserVolume).toHaveBeenLastCalledWith('u1', 0.3)
  })
})
