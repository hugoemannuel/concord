import { describe, expect, it } from 'vitest'
import type { CallInfo, CallParticipant, CallStateResponse } from '../api/calls'
import {
  applyChannelEnded,
  applyChannelJoined,
  applyChannelLeft,
  callsByChannel,
  replaceServerCalls,
  voiceActivityByServer
} from './voiceList'

const call = (id: string, channelId: string, serverId = 's1'): CallInfo => ({
  id,
  type: 'channel',
  channel_id: channelId,
  server_id: serverId,
  initiator_id: 'ana',
  status: 'active',
  started_at: '2026-11-06T10:00:00Z'
})

const person = (callId: string, userId: string): CallParticipant => ({
  call_id: callId,
  user_id: userId,
  role: 'member',
  joined_at: '2026-11-06T10:00:00Z',
  display_name: userId.toUpperCase()
})

const entry = (c: CallInfo, ...users: string[]): CallStateResponse => ({
  call: c,
  participants: users.map((u) => person(c.id, u)),
  screen_sharing: []
})

describe('applyChannelJoined', () => {
  it('canal vazio ganha a linha da chamada com quem entrou', () => {
    const next = applyChannelJoined({}, { call: call('c1', 'voz'), participant: person('c1', 'ana') })
    expect(next.voz.call?.id).toBe('c1')
    expect(next.voz.participants.map((p) => p.user_id)).toEqual(['ana'])
  })

  it('chamada conhecida: entra no fim da lista, sem repetir quem já estava', () => {
    const map = { voz: entry(call('c1', 'voz'), 'ana') }
    const once = applyChannelJoined(map, { call: call('c1', 'voz'), participant: person('c1', 'bia') })
    const twice = applyChannelJoined(once, { call: call('c1', 'voz'), participant: person('c1', 'bia') })
    expect(twice.voz.participants.map((p) => p.user_id)).toEqual(['ana', 'bia'])
  })

  it('a chamada do canal mudou (o fim se perdeu): troca pela nova', () => {
    const map = { voz: entry(call('velha', 'voz'), 'ana') }
    const next = applyChannelJoined(map, { call: call('c2', 'voz'), participant: person('c2', 'bia') })
    expect(next.voz.call?.id).toBe('c2')
    expect(next.voz.participants.map((p) => p.user_id)).toEqual(['bia'])
  })

  it('não mexe nos outros canais', () => {
    const outro = entry(call('c9', 'outro'), 'caio')
    const next = applyChannelJoined({ outro }, { call: call('c1', 'voz'), participant: person('c1', 'ana') })
    expect(next.outro).toBe(outro)
  })
})

describe('applyChannelLeft', () => {
  it('tira a pessoa da lista e do selo LIVE', () => {
    const map = { voz: { ...entry(call('c1', 'voz'), 'ana', 'bia'), screen_sharing: ['bia'] } }
    const next = applyChannelLeft(map, { call_id: 'c1', channel_id: 'voz', user_id: 'bia' })
    expect(next.voz.participants.map((p) => p.user_id)).toEqual(['ana'])
    expect(next.voz.screen_sharing).toEqual([])
  })

  it('o último a sair leva a linha do canal junto', () => {
    const map = { voz: entry(call('c1', 'voz'), 'ana') }
    expect(applyChannelLeft(map, { call_id: 'c1', channel_id: 'voz', user_id: 'ana' })).toEqual({})
  })

  it('evento de outra chamada (velha) não mexe na lista', () => {
    const map = { voz: entry(call('c2', 'voz'), 'ana') }
    expect(applyChannelLeft(map, { call_id: 'c1', channel_id: 'voz', user_id: 'ana' })).toBe(map)
  })
})

describe('applyChannelEnded', () => {
  it('tira a linha do canal', () => {
    const map = { voz: entry(call('c1', 'voz'), 'ana'), outro: entry(call('c9', 'outro'), 'caio') }
    const next = applyChannelEnded(map, { call_id: 'c1', channel_id: 'voz' })
    expect(Object.keys(next)).toEqual(['outro'])
  })

  it('chamada que já não está lá: mesmo mapa', () => {
    const map = { voz: entry(call('c2', 'voz'), 'ana') }
    expect(applyChannelEnded(map, { call_id: 'c1', channel_id: 'voz' })).toBe(map)
  })
})

describe('replaceServerCalls', () => {
  it('troca só as chamadas do servidor lido', () => {
    const map = {
      a: entry(call('c1', 'a', 's1'), 'ana'),
      b: entry(call('c2', 'b', 's2'), 'bia')
    }
    const next = replaceServerCalls(map, 's1', { c: entry(call('c3', 'c', 's1'), 'caio') })
    expect(Object.keys(next).sort()).toEqual(['b', 'c'])
    expect(next.b).toBe(map.b)
  })
})

describe('voiceActivityByServer', () => {
  it('quem está em voz, por servidor pedido (só os que têm gente)', () => {
    const map = {
      a: entry(call('c1', 'a', 's1'), 'ana'),
      b: entry(call('c2', 'b', 's1'), 'bia', 'ana'),
      c: entry(call('c3', 'c', 's2'), 'caio'),
      d: entry(call('c4', 'd', 's3'), 'duda')
    }
    const activity = voiceActivityByServer(map, ['s1', 's2', 's4'])
    expect([...activity.keys()].sort()).toEqual(['s1', 's2'])
    expect(activity.get('s1')?.map((m) => m.id)).toEqual(['ana', 'bia'])
    expect(activity.get('s2')?.[0]).toEqual({ id: 'caio', name: 'CAIO', avatarUrl: null })
  })
})

describe('callsByChannel', () => {
  it('indexa pelo canal de voz (sem canal fica de fora)', () => {
    const semCanal = { call: null, participants: [person('c0', 'bia')] }
    const map = callsByChannel([entry(call('c1', 'v1'), 'ana'), semCanal])
    expect(Object.keys(map)).toEqual(['v1'])
  })
})
