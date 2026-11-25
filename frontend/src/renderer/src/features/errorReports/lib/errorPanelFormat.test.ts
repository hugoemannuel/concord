import { describe, expect, it } from 'vitest'
import {
  agoLabel,
  errorTitle,
  groupElementId,
  peopleLabel,
  pickStack,
  shortList,
  sourceLabel,
  targetLabel,
  timesLabel,
  whereLabel
} from './errorPanelFormat'

const NOW = Date.parse('2026-11-25T12:00:00Z')
const ago = (ms: number): string => new Date(NOW - ms).toISOString()
const MIN = 60_000
const HOUR = 60 * MIN

describe('sourceLabel', () => {
  it.each([
    ['renderer', 'Desktop/web'],
    ['main', 'Electron'],
    ['mobile', 'Android'],
    ['backend', 'Servidor'],
    ['outra', 'outra']
  ])('%s → %s', (source, label) => {
    expect(sourceLabel(source)).toBe(label)
  })
})

describe('targetLabel', () => {
  it.each([
    ['desktop', 'Desktop'],
    ['web', 'Web'],
    ['android', 'Android'],
    ['servidor', 'Servidor'],
    ['', '—'],
    ['tv', 'tv']
  ])('%s → %s', (target, label) => {
    expect(targetLabel(target)).toBe(label)
  })
})

describe('agoLabel', () => {
  it.each([
    [ago(20_000), 'agora'],
    [ago(-5 * MIN), 'agora'],
    [ago(MIN), 'há 1 min'],
    [ago(59 * MIN), 'há 59 min'],
    [ago(3 * HOUR + 20 * MIN), 'há 3 h'],
    [ago(24 * HOUR), 'há 1 dia'],
    [ago(13 * 24 * HOUR), 'há 13 dias']
  ])('%s → %s', (iso, label) => {
    expect(agoLabel(iso, NOW)).toBe(label)
  })
  it('data inválida vira traço', () => {
    expect(agoLabel('', NOW)).toBe('—')
  })
})

describe('shortList', () => {
  it.each([
    [[], '—'],
    [['1.4.2'], '1.4.2'],
    [['1.4.2', '1.4.1'], '1.4.2, 1.4.1'],
    [['1.4.2', '1.4.1', '1.4.0', '1.3.9'], '1.4.2, 1.4.1 +2']
  ])('%j → %s', (items, label) => {
    expect(shortList(items)).toBe(label)
  })
  it('limite próprio', () => {
    expect(shortList(['a', 'b', 'c'], 1)).toBe('a +2')
  })
})

describe('contagens', () => {
  it.each([
    [1, '1 pessoa', '1 vez'],
    [2, '2 pessoas', '2 vezes'],
    [12345, '12.345 pessoas', '12.345 vezes']
  ])('%d', (n, people, times) => {
    expect(peopleLabel(n)).toBe(people)
    expect(timesLabel(n)).toBe(times)
  })
})

describe('errorTitle', () => {
  it.each([
    ['TypeError', 'x is undefined', 'TypeError: x is undefined'],
    ['', 'só a mensagem', 'só a mensagem'],
    ['RangeError', '', 'RangeError'],
    ['', '', 'Erro sem mensagem']
  ])('%s / %s', (kind, message, title) => {
    expect(errorTitle(kind, message)).toBe(title)
  })
})

describe('whereLabel', () => {
  it.each([
    [true, true, 'Em call e em live'],
    [true, false, 'Em call'],
    [false, true, 'Em live'],
    [false, false, '—']
  ])('call %s, live %s', (inCall, inLive, label) => {
    expect(whereLabel({ in_call: inCall, in_live: inLive })).toBe(label)
  })
})

describe('pickStack', () => {
  it('traduzida por padrão, crua quando pedida', () => {
    const d = { stack: 'crua', translated: 'traduzida' }
    expect(pickStack(d, false)).toEqual({ text: 'traduzida', translated: true, canToggle: true })
    expect(pickStack(d, true)).toEqual({ text: 'crua', translated: false, canToggle: true })
  })
  it('sem tradução: só a crua, sem alternar', () => {
    expect(pickStack({ stack: 'crua', translated: '' }, false)).toEqual({
      text: 'crua',
      translated: false,
      canToggle: false
    })
  })
})

describe('groupElementId', () => {
  it('id estável a partir da impressão digital', () => {
    expect(groupElementId('ab12')).toBe('erro-grupo-ab12')
  })
})
