import { describe, expect, it } from 'vitest'
import {
  showVoicePanel,
  userBarSpeaking,
  userBarSubtitle,
  voicePanelHeading,
  voicePanelLabel,
  voicePanelRoute
} from './voicePanel'

describe('voicePanelLabel', () => {
  it('canal de voz: "canal / servidor", como no Discord', () => {
    expect(
      voicePanelLabel({
        type: 'channel',
        channelName: 'Geral',
        serverName: 'Salinha',
        peerName: null
      })
    ).toBe('Geral / Salinha')
  })

  it('sem o nome do servidor mostra só o canal', () => {
    expect(
      voicePanelLabel({ type: 'channel', channelName: 'Geral', serverName: null, peerName: null })
    ).toBe('Geral')
  })

  it('sem o nome do canal (ainda carregando) usa "Canal de voz"', () => {
    expect(
      voicePanelLabel({ type: 'channel', channelName: null, serverName: 'Salinha', peerName: null })
    ).toBe('Canal de voz / Salinha')
    expect(
      voicePanelLabel({ type: 'channel', channelName: '  ', serverName: '', peerName: null })
    ).toBe('Canal de voz')
  })

  it('DM: o nome da outra pessoa', () => {
    expect(
      voicePanelLabel({ type: 'dm', channelName: null, serverName: null, peerName: 'Ana' })
    ).toBe('Ana')
  })

  it('DM sem a pessoa ainda: "Chamada"', () => {
    expect(voicePanelLabel({ type: 'dm', channelName: null, serverName: null, peerName: '' })).toBe(
      'Chamada'
    )
    expect(
      voicePanelLabel({ type: null, channelName: null, serverName: null, peerName: null })
    ).toBe('Chamada')
  })
})

describe('voicePanelRoute', () => {
  it('canal de voz: a tela do canal no servidor da chamada', () => {
    expect(
      voicePanelRoute({ type: 'channel', serverId: 's1', channelId: 'c1', participants: [] })
    ).toBe('/servers/s1/channels/c1')
  })

  it('canal de voz usa o servidor da chamada, não o que está aberto', () => {
    // Mesmo com outras pessoas na lista, quem manda é serverId/channelId.
    expect(
      voicePanelRoute({
        type: 'channel',
        serverId: 's2',
        channelId: 'voz',
        participants: [{ id: 'ana' }]
      })
    ).toBe('/servers/s2/channels/voz')
  })

  it('DM: a conversa com a outra pessoa', () => {
    expect(
      voicePanelRoute({
        type: 'dm',
        serverId: null,
        channelId: null,
        participants: [{ id: 'ana' }]
      })
    ).toBe('/dm/ana')
  })

  it('sem dados para chegar lá não há rota', () => {
    expect(
      voicePanelRoute({ type: 'channel', serverId: null, channelId: 'c1', participants: [] })
    ).toBeNull()
    expect(
      voicePanelRoute({ type: 'dm', serverId: null, channelId: null, participants: [] })
    ).toBeNull()
    expect(
      voicePanelRoute({ type: null, serverId: null, channelId: null, participants: [] })
    ).toBeNull()
  })
})

describe('showVoicePanel / voicePanelHeading', () => {
  it('aparece na chamada ativa e enquanto chama alguém', () => {
    expect(showVoicePanel('active')).toBe(true)
    expect(showVoicePanel('outgoing')).toBe(true)
  })

  it('fica escondido sem chamada', () => {
    expect(showVoicePanel('idle')).toBe(false)
  })

  it('título: o estado da conexão de voz na chamada, "Chamando…" antes de atenderem', () => {
    expect(voicePanelHeading('active', 'Voz conectada')).toBe('Voz conectada')
    expect(voicePanelHeading('active', 'Reconectando à chamada…')).toBe('Reconectando à chamada…')
    expect(voicePanelHeading('outgoing', 'Conectando à chamada…')).toBe('Chamando…')
  })
})

describe('userBarSubtitle', () => {
  it('na chamada: "Em call"', () => {
    expect(userBarSubtitle({ inCall: true, note: 'jogando', statusLabel: 'Online' })).toBe(
      'Em call'
    )
  })

  it('jogando: o jogo vale mais que a chamada', () => {
    expect(
      userBarSubtitle({ inCall: true, note: 'x', statusLabel: 'Online', game: 'VALORANT' })
    ).toBe('VALORANT')
  })

  it('fora da chamada: a nota, ou o status', () => {
    expect(userBarSubtitle({ inCall: false, note: ' jogando ', statusLabel: 'Online' })).toBe(
      'jogando'
    )
    expect(userBarSubtitle({ inCall: false, note: '', statusLabel: 'Ausente' })).toBe('Ausente')
    expect(userBarSubtitle({ inCall: false, note: null, statusLabel: 'Online' })).toBe('Online')
  })
})

describe('userBarSpeaking', () => {
  const base = { inCall: true, muted: false, userId: 'me', speakingIds: ['me', 'outro'] }

  it('falando na chamada: anel', () => {
    expect(userBarSpeaking(base)).toBe(true)
  })

  it('mudo nunca mostra o anel', () => {
    expect(userBarSpeaking({ ...base, muted: true })).toBe(false)
  })

  it('fora da chamada, calado ou sem usuário: sem anel', () => {
    expect(userBarSpeaking({ ...base, inCall: false })).toBe(false)
    expect(userBarSpeaking({ ...base, speakingIds: ['outro'] })).toBe(false)
    expect(userBarSpeaking({ ...base, userId: null })).toBe(false)
  })
})
