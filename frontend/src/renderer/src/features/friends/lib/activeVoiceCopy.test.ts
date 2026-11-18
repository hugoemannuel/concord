import { describe, expect, it } from 'vitest'
import { inCallCount, joinFriendCallLabel, voiceCardLine } from './activeVoiceCopy'

describe('voiceCardLine', () => {
  it('servidor e canal separados por ponto', () => {
    expect(voiceCardLine('Os Brabos', 'Geral')).toBe('Os Brabos · Geral')
  })
  it('sem nomes, usa os padrões', () => {
    expect(voiceCardLine(undefined, null)).toBe('Servidor · Canal de voz')
    expect(voiceCardLine('  ', ' ')).toBe('Servidor · Canal de voz')
  })
})

describe('inCallCount', () => {
  it('conta quem está na call', () => {
    expect(inCallCount(1)).toBe('1 na call')
    expect(inCallCount(4)).toBe('4 na call')
  })
})

describe('joinFriendCallLabel', () => {
  it('diz de quem é a call e o canal', () => {
    expect(joinFriendCallLabel('Ana', 'Geral')).toBe('Entrar na call de Ana em Geral')
  })
  it('sem canal, usa Canal de voz', () => {
    expect(joinFriendCallLabel('Ana', null)).toBe('Entrar na call de Ana em Canal de voz')
  })
})
