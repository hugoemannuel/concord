import { describe, expect, it } from 'vitest'
import {
  autoUpdateUnavailable,
  backgroundDownloadDelayMs,
  DOWNLOAD_JITTER_MAX_MS,
  isRefusedRelease,
  retryDelayMs
} from './updatePolicy'

describe('backgroundDownloadDelayMs', () => {
  const later = 10 * 60_000

  it('espalha o download em segundo plano entre 0 e 2 min', () => {
    expect(DOWNLOAD_JITTER_MAX_MS).toBe(120_000)
    expect(backgroundDownloadDelayMs({ force: false, msSinceStart: later, random: 0 })).toBe(0)
    expect(backgroundDownloadDelayMs({ force: false, msSinceStart: later, random: 0.5 })).toBe(
      60_000
    )
    expect(
      backgroundDownloadDelayMs({ force: false, msSinceStart: later, random: 0.999999 })
    ).toBeLessThan(120_000)
  })

  it('clicar em Atualizar não espera', () => {
    expect(backgroundDownloadDelayMs({ force: true, msSinceStart: later, random: 0.9 })).toBe(0)
  })

  it('logo ao abrir o app não espera (cada um abre numa hora; instala do cache)', () => {
    expect(backgroundDownloadDelayMs({ force: false, msSinceStart: 5_000, random: 0.9 })).toBe(0)
    expect(backgroundDownloadDelayMs({ force: false, msSinceStart: 31_000, random: 0.9 })).toBe(
      108_000
    )
  })

  it('sorteio fora de [0, 1) não passa do teto nem fica negativo', () => {
    expect(backgroundDownloadDelayMs({ force: false, msSinceStart: later, random: -1 })).toBe(0)
    expect(backgroundDownloadDelayMs({ force: false, msSinceStart: later, random: 5 })).toBe(
      120_000
    )
  })

  it('aceita outro teto', () => {
    expect(
      backgroundDownloadDelayMs({ force: false, msSinceStart: later, random: 0.5 }, 1000)
    ).toBe(500)
  })
})

describe('retryDelayMs', () => {
  it('espera cada vez mais depois de falhas (1 min, 5 min, 30 min, 2 h) até 6 h', () => {
    expect(retryDelayMs(0)).toBe(0)
    expect(retryDelayMs(1)).toBe(60_000)
    expect(retryDelayMs(2)).toBe(5 * 60_000)
    expect(retryDelayMs(3)).toBe(30 * 60_000)
    expect(retryDelayMs(4)).toBe(2 * 3_600_000)
    expect(retryDelayMs(5)).toBe(6 * 3_600_000)
    expect(retryDelayMs(50)).toBe(6 * 3_600_000)
  })
})

describe('isRefusedRelease', () => {
  const refused = { version: '0.7.0', sha512: 'abc' }

  it('mesmo par versão + sha512 já recusado: não baixa de novo', () => {
    expect(isRefusedRelease(refused, { version: '0.7.0', sha512: 'abc' })).toBe(true)
  })

  it('sha512 novo (republicado) ou outra versão: tenta', () => {
    expect(isRefusedRelease(refused, { version: '0.7.0', sha512: 'def' })).toBe(false)
    expect(isRefusedRelease(refused, { version: '0.7.1', sha512: 'abc' })).toBe(false)
    expect(isRefusedRelease(null, { version: '0.7.0', sha512: 'abc' })).toBe(false)
  })

  it('sem sha512 conhecido compara só a versão', () => {
    expect(
      isRefusedRelease({ version: '0.7.0', sha512: '' }, { version: '0.7.0', sha512: '' })
    ).toBe(true)
  })
})

describe('autoUpdateUnavailable', () => {
  it('Linux empacotado sem APPIMAGE (AppImage extraído) não atualiza sozinho', () => {
    expect(
      autoUpdateUnavailable({
        platform: 'linux',
        isPackaged: true,
        appImage: undefined,
        selfUpdating: false
      })
    ).toBe(true)
    expect(
      autoUpdateUnavailable({
        platform: 'linux',
        isPackaged: true,
        appImage: '',
        selfUpdating: false
      })
    ).toBe(true)
  })

  it('AppImage extraído ou instalação por usuário com o updater próprio: atualiza, não avisa', () => {
    expect(
      autoUpdateUnavailable({
        platform: 'linux',
        isPackaged: true,
        appImage: undefined,
        selfUpdating: true
      })
    ).toBe(false)
  })

  it('AppImage normal, Windows e dev não avisam', () => {
    expect(
      autoUpdateUnavailable({
        platform: 'linux',
        isPackaged: true,
        appImage: '/home/a/S.AppImage',
        selfUpdating: false
      })
    ).toBe(false)
    expect(
      autoUpdateUnavailable({
        platform: 'win32',
        isPackaged: true,
        appImage: undefined,
        selfUpdating: false
      })
    ).toBe(false)
    expect(
      autoUpdateUnavailable({
        platform: 'linux',
        isPackaged: false,
        appImage: undefined,
        selfUpdating: false
      })
    ).toBe(false)
  })
})
