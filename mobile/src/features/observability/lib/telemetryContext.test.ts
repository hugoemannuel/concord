import { buildClientContext } from './telemetryContext'

describe('buildClientContext', () => {
  it('Android com a versão, o app, o aparelho e a rede', () => {
    expect(buildClientContext({ release: '14', version: '0.1.0', manufacturer: 'samsung', model: 'SM-A515F', network: 'wifi' })).toEqual({
      os: 'Android 14',
      app_version: '0.1.0',
      target: 'android',
      gpu: '',
      network: 'wifi',
      cores: 0,
      device: 'samsung SM-A515F'
    })
  })

  it('sem versão nem fabricante: o que houver', () => {
    expect(buildClientContext({ release: '', version: '', manufacturer: '', model: 'Pixel 7', network: '' })).toMatchObject({ os: 'Android', device: 'Pixel 7' })
  })

  it('modelo que já traz o fabricante não repete', () => {
    expect(buildClientContext({ release: '15', version: '', manufacturer: 'Google', model: 'Google Pixel 8', network: '' }).device).toBe('Google Pixel 8')
  })
})
