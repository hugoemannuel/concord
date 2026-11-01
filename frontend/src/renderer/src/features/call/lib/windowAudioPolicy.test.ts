import { describe, expect, it } from 'vitest'
import { portWaitMs } from './windowAudioPolicy'

describe('portWaitMs', () => {
  it('espera a porta só para janela no Windows', () => {
    expect(portWaitMs(true, () => 'win32')).toBe(1000)
  })

  it('não espera em tela inteira, em outro sistema ou fora do Electron', () => {
    expect(portWaitMs(false, () => 'win32')).toBe(0)
    expect(portWaitMs(true, () => 'linux')).toBe(0)
    expect(portWaitMs(true, () => undefined)).toBe(0)
  })

  it('sem janela escolhida nem pergunta a plataforma (testes e web sem window.api)', () => {
    expect(
      portWaitMs(false, () => {
        throw new Error('não devia perguntar')
      })
    ).toBe(0)
  })
})
