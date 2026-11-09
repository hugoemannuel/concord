import { describe, expect, it } from 'vitest'
import { ApiError } from '../../../shared/api/client'
import {
  SLOWMODE_OPTIONS,
  formatWait,
  remainingSeconds,
  slowmodeView,
  slowmodeBarText,
  slowmodeErrorText,
  slowmodeLabel,
  slowmodeRetryAfter
} from './slowmode'

describe('modo lento', () => {
  it('oferece os intervalos do Discord, começando por desligado', () => {
    expect(SLOWMODE_OPTIONS.map((o) => o.value)).toEqual([
      0, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 21600
    ])
    expect(SLOWMODE_OPTIONS.map((o) => o.label)).toEqual([
      'Desligado', '5 s', '10 s', '15 s', '30 s', '1 min', '2 min', '5 min', '10 min',
      '15 min', '30 min', '1 h', '2 h', '6 h'
    ])
  })

  it('rotula o intervalo em s, min ou h', () => {
    expect(slowmodeLabel(30)).toBe('30 s')
    expect(slowmodeLabel(120)).toBe('2 min')
    expect(slowmodeLabel(21600)).toBe('6 h')
  })

  it('formata a espera como relógio', () => {
    expect(formatWait(12)).toBe('0:12')
    expect(formatWait(65)).toBe('1:05')
    expect(formatWait(3600)).toBe('1:00:00')
    expect(formatWait(21599)).toBe('5:59:59')
  })

  it('escreve a faixa conforme o estado', () => {
    expect(slowmodeBarText({ seconds: 0, exempt: false, remaining: 0 })).toBeNull()
    expect(slowmodeBarText({ seconds: 30, exempt: false, remaining: 0 })).toBe(
      'Modo lento: 1 mensagem a cada 30 s'
    )
    expect(slowmodeBarText({ seconds: 30, exempt: false, remaining: 12 })).toBe(
      'Modo lento: aguarde 0:12'
    )
    expect(slowmodeBarText({ seconds: 30, exempt: true, remaining: 12 })).toBe(
      'Modo lento ativado (você está isento)'
    )
  })

  it('escreve o aviso de erro', () => {
    expect(slowmodeErrorText(12)).toBe('Modo lento: aguarde 12 s para mandar outra mensagem.')
  })

  it('lê o retry_after do 429 de modo lento', () => {
    expect(slowmodeRetryAfter(new ApiError(429, 'x', 'slowmode', { retry_after: 12 }))).toBe(12)
    expect(slowmodeRetryAfter(new ApiError(429, 'x', 'slowmode', {}))).toBe(1)
    expect(slowmodeRetryAfter(new ApiError(429, 'x', 'tts_cooldown', { retry_after: 9 }))).toBeNull()
    expect(slowmodeRetryAfter(new Error('rede'))).toBeNull()
  })

  it('conta os segundos que faltam, para cima', () => {
    expect(remainingSeconds(10_500, 0)).toBe(11)
    expect(remainingSeconds(1000, 1000)).toBe(0)
    expect(remainingSeconds(0, 5000)).toBe(0)
  })

  it('só bloqueia quem não é isento, com o modo lento ligado e espera pendente', () => {
    expect(slowmodeView({ seconds: 30, exempt: false, remaining: 5 }).blocked).toBe(true)
    expect(slowmodeView({ seconds: 30, exempt: true, remaining: 5 }).blocked).toBe(false)
    expect(slowmodeView({ seconds: 0, exempt: false, remaining: 5 })).toEqual({ text: null, blocked: false })
    expect(slowmodeView({ seconds: 30, exempt: false, remaining: 0 }).blocked).toBe(false)
  })
})
