import { useCallNoticeStore } from '../store/callNoticeStore'
import { useCallSessionStore } from '../store/callSessionStore'
import { useIncomingCallStore } from '../store/incomingCallStore'
import { useParticipantsStore } from '../store/participantsStore'
import { handleCallEvent } from './callEvents'

import { playSound } from './sounds/soundPlayer'

jest.mock('./sounds/soundPlayer', () => ({ playSound: jest.fn() }))

const ana = { id: 'u1', username: 'ana', display_name: 'Ana' }
const bia = { id: 'u2', username: 'bia', display_name: 'Bia' }
const ev = (type: string, payload: unknown) => handleCallEvent({ type, payload }, 'me')
const session = () => useCallSessionStore.getState()

function inChannelCall(): void {
  session().begin({ callId: 'c1', kind: 'channel', phase: 'active', channelId: 'ch1', name: 'Geral' })
}

beforeEach(() => {
  session().reset()
  useParticipantsStore.getState().reset()
  useIncomingCallStore.getState().clear()
  useCallNoticeStore.getState().dismiss()
})

describe('sons da sala', () => {
  it('alguém entra ou sai de um canal de voz: toca userJoin e userLeave', () => {
    inChannelCall()
    jest.mocked(playSound).mockClear()
    ev('call:joined', { call_id: 'c1', user: ana })
    expect(playSound).toHaveBeenLastCalledWith('userJoin')
    ev('call:left', { call_id: 'c1', user: ana })
    expect(playSound).toHaveBeenLastCalledWith('userLeave')
  })

  it('eu entrando ou saindo não toca o som dos outros', () => {
    inChannelCall()
    jest.mocked(playSound).mockClear()
    handleCallEvent({ type: 'call:joined', payload: { call_id: 'c1', user: ana } }, 'u1')
    expect(playSound).not.toHaveBeenCalled()
  })
})

describe('call:invite', () => {
  it('DM tocando: guarda a chamada recebida', () => {
    ev('call:invite', { call_id: 'c9', type: 'dm', initiator: ana, conversation_id: 'cv1' })
    expect(useIncomingCallStore.getState().call).toEqual({ callId: 'c9', conversationId: 'cv1', initiator: ana })
  })

  it('convite com call ativa toca (atender troca de call, estilo Discord)', () => {
    inChannelCall()
    ev('call:invite', { call_id: 'c9', type: 'dm', initiator: ana, conversation_id: 'cv1' })
    expect(useIncomingCallStore.getState().call?.callId).toBe('c9')
    expect(session().callId).toBe('c1')
  })

  it('ignora convite que não é de DM', () => {
    ev('call:invite', { call_id: 'c9', type: 'channel', initiator: ana })
    expect(useIncomingCallStore.getState().call).toBeNull()
  })
})

describe('call:accept / call:decline / call:ring', () => {
  beforeEach(() => session().begin({ callId: 'c1', kind: 'dm', phase: 'outgoing', conversationId: 'cv1', name: 'Ana' }))

  it('accept de quem eu liguei: passa a conectar e lista a pessoa', () => {
    ev('call:accept', { call_id: 'c1', user: ana })
    expect(session().phase).toBe('connecting')
    expect(useParticipantsStore.getState().people).toEqual([ana])
  })

  it('accept de outra chamada é ignorado', () => {
    ev('call:accept', { call_id: 'outra', user: ana })
    expect(session().phase).toBe('outgoing')
  })

  it('decline encerra e avisa quem recusou', () => {
    ev('call:decline', { call_id: 'c1', user: ana })
    expect(session().phase).toBe('idle')
    expect(useCallNoticeStore.getState().message).toBe('Ana recusou a chamada.')
  })

  it('ring lista o chamado', () => {
    ev('call:ring', { call_id: 'c1', callee: bia })
    expect(useParticipantsStore.getState().people).toEqual([bia])
  })
})

describe('call:joined / call:left (canal)', () => {
  beforeEach(inChannelCall)

  it('joined de outra pessoa entra na lista; o meu próprio é ignorado', () => {
    ev('call:joined', { call_id: 'c1', user: ana })
    ev('call:joined', { call_id: 'c1', user: { ...bia, id: 'me' } })
    expect(useParticipantsStore.getState().people).toEqual([ana])
  })

  it('joined de outra chamada é ignorado', () => {
    ev('call:joined', { call_id: 'x', user: ana })
    expect(useParticipantsStore.getState().people).toEqual([])
  })

  it('left tira a pessoa e o estado de voz dela', () => {
    ev('call:joined', { call_id: 'c1', user: ana })
    ev('call:voice', { call_id: 'c1', user_id: 'u1', muted: true, deafened: false })
    ev('call:left', { call_id: 'c1', user: ana })
    expect(useParticipantsStore.getState()).toMatchObject({ people: [], voice: {} })
  })

  it('left do meu usuário não encerra (a mídia decide)', () => {
    ev('call:left', { call_id: 'c1', user: { ...ana, id: 'me' } })
    expect(session().phase).toBe('active')
  })
})

describe('call:left (DM)', () => {
  beforeEach(() => session().begin({ callId: 'c1', kind: 'dm', phase: 'active', conversationId: 'cv1', name: 'Ana' }))

  it('na DM a saída do outro encerra a chamada com aviso', () => {
    ev('call:left', { call_id: 'c1', user: ana })
    expect(session().phase).toBe('idle')
    expect(useCallNoticeStore.getState().message).toBe('Ana saiu da chamada.')
  })
})

describe('call:voice', () => {
  it('guarda mudo, fone e o que o moderador impôs', () => {
    inChannelCall()
    ev('call:voice', { call_id: 'c1', user_id: 'u1', muted: true, deafened: false, server_muted: true })
    expect(useParticipantsStore.getState().voice.u1).toEqual({ muted: true, deafened: false, serverMuted: true, serverDeafened: false })
  })

  it('de outra chamada é ignorado', () => {
    inChannelCall()
    ev('call:voice', { call_id: 'x', user_id: 'u1', muted: true, deafened: false })
    expect(useParticipantsStore.getState().voice).toEqual({})
  })
})

describe('call:ended / call:busy / call:error / call:moved', () => {
  it('ended da minha chamada volta a ocioso e avisa', () => {
    inChannelCall()
    ev('call:ended', { call_id: 'c1' })
    expect(session().phase).toBe('idle')
    expect(useCallNoticeStore.getState().message).toBe('A chamada terminou.')
  })

  it('ended da chamada que estava tocando limpa a chamada recebida', () => {
    useIncomingCallStore.getState().ring({ callId: 'c9', conversationId: 'cv', initiator: ana })
    ev('call:ended', { call_id: 'c9' })
    expect(useIncomingCallStore.getState().call).toBeNull()
  })

  it('ended de outra chamada é ignorado', () => {
    inChannelCall()
    ev('call:ended', { call_id: 'x' })
    expect(session().phase).toBe('active')
  })

  it('busy encerra e avisa', () => {
    session().begin({ callId: 'c1', kind: 'dm', phase: 'outgoing', conversationId: 'cv', name: 'Ana' })
    ev('call:busy', { call_id: 'c1' })
    expect(session().phase).toBe('idle')
    expect(useCallNoticeStore.getState().message).toBe('Essa pessoa já está em outra chamada.')
  })

  it('error mostra a mensagem do servidor', () => {
    ev('call:error', { message: 'algo deu errado' })
    expect(useCallNoticeStore.getState().message).toBe('algo deu errado')
  })

  it('moved comigo: pede para entrar no canal novo', () => {
    inChannelCall()
    ev('call:moved', { from_call_id: 'c1', channel_id: 'ch2', channel_name: 'Jogos', user: { ...ana, id: 'me' } })
    expect(session().movedTo).toEqual({ channelId: 'ch2', name: 'Jogos' })
  })

  it('moved de outra pessoa não faz nada comigo', () => {
    inChannelCall()
    ev('call:moved', { from_call_id: 'c1', channel_id: 'ch2', channel_name: 'Jogos', user: ana })
    expect(session().movedTo).toBeNull()
  })

  it('evento desconhecido é ignorado', () => {
    expect(() => ev('call:screen', { call_id: 'c1' })).not.toThrow()
  })
})
