import { describe, expect, it } from 'vitest'
import { screenSourceInfo } from './screenSourceInfo'

describe('screenSourceInfo', () => {
  it('o tamanho da fonte e o tipo de superfície (nunca o título)', () => {
    const settings = {
      width: 2560,
      height: 1440,
      displaySurface: 'monitor',
      deviceId: 'screen:0:0'
    }
    expect(screenSourceInfo(settings)).toEqual({ width: 2560, height: 1440, surface: 'monitor' })
  })
  it('sem os campos: vazios', () => {
    expect(screenSourceInfo({})).toEqual({ width: null, height: null, surface: null })
  })
  it('superfície desconhecida fica vazia', () => {
    expect(
      screenSourceInfo({ displaySurface: 'application' } as MediaTrackSettings).surface
    ).toBeNull()
  })
})
