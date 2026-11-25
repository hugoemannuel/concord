import { describe, expect, it } from 'vitest'
import { buildClientContext, gpuName, networkOf, osName, appVersionOf } from './telemetryContext'

describe('osName', () => {
  it.each([
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Salinha/1.2', 'Windows'],
    ['Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36', 'Linux'],
    ['Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36', 'Android'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'macOS'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', 'iOS'],
    ['Mozilla/5.0 (X11; CrOS x86_64 14541.0.0)', 'ChromeOS'],
    ['algo estranho', 'outro']
  ])('%s → %s', (ua, want) => {
    expect(osName(ua)).toBe(want)
  })
})

describe('gpuName', () => {
  const gl = (renderer: unknown, ext = true) => ({
    getExtension: (name: string) =>
      ext && name === 'WEBGL_debug_renderer_info' ? { UNMASKED_RENDERER_WEBGL: 7 } : null,
    getParameter: (p: number) => (p === 7 ? renderer : 'genérico')
  })
  it('o renderer sem a máscara (placa de verdade)', () => {
    expect(
      gpuName(gl('ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 Direct3D11 vs_5_0 ps_5_0, D3D11)'))
    ).toBe('ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 Direct3D11 vs_5_0 ps_5_0, D3D11)')
  })
  it('sem a extensão, sem WebGL ou valor estranho: vazio', () => {
    expect(gpuName(gl('x', false))).toBe('')
    expect(gpuName(null)).toBe('')
    expect(gpuName(gl(42))).toBe('')
  })
})

describe('networkOf', () => {
  it('prefere o tipo físico; senão a estimativa; sem API, vazio', () => {
    expect(networkOf({ type: 'wifi', effectiveType: '4g' })).toBe('wifi')
    expect(networkOf({ effectiveType: '3g' })).toBe('3g')
    expect(networkOf(undefined)).toBe('')
  })
})

describe('buildClientContext', () => {
  it('junta tudo', () => {
    expect(
      buildClientContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0)',
        version: '1.4.0',
        web: false,
        gpu: 'ANGLE (AMD)',
        network: 'ethernet',
        cores: 8
      })
    ).toEqual({
      os: 'Windows',
      app_version: '1.4.0',
      target: 'desktop',
      gpu: 'ANGLE (AMD)',
      network: 'ethernet',
      cores: 8
    })
  })
})

describe('loadClientContext', () => {
  it('lê o navegador e a versão do app (a placa uma vez só)', async () => {
    const { vi } = await import('vitest')
    const getContext = vi.fn(() => ({
      getExtension: () => ({ UNMASKED_RENDERER_WEBGL: 1 }),
      getParameter: () => 'ANGLE (Intel)'
    }))
    vi.stubGlobal('document', { createElement: () => ({ getContext }) })
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64)',
      connection: { effectiveType: '4g' },
      hardwareConcurrency: 4
    })
    vi.stubGlobal('window', { api: { updates: { currentVersion: async () => '2.0.0' } } })
    const { loadClientContext } = await import('./telemetryContext')
    expect(await loadClientContext()).toMatchObject({
      os: 'Linux',
      app_version: '2.0.0',
      gpu: 'ANGLE (Intel)',
      network: '4g',
      cores: 4
    })
    vi.stubGlobal('window', {})
    vi.stubGlobal('navigator', { userAgent: '' })
    expect(await loadClientContext()).toMatchObject({
      app_version: '',
      gpu: 'ANGLE (Intel)',
      cores: 0
    })
    expect(getContext).toHaveBeenCalledTimes(1)
    vi.unstubAllGlobals()
  })

  it('sem WebGL: placa vazia', async () => {
    const { vi } = await import('vitest')
    vi.resetModules()
    vi.stubGlobal('document', {
      createElement: () => {
        throw new Error('sem canvas')
      }
    })
    vi.stubGlobal('navigator', { userAgent: '' })
    vi.stubGlobal('window', {})
    const { loadClientContext } = await import('./telemetryContext')
    expect((await loadClientContext()).gpu).toBe('')
    vi.unstubAllGlobals()
  })
})

describe('appVersionOf', () => {
  it('a do preload (desktop); sem resposta (web), a do build', () => {
    expect(appVersionOf('0.6.102', '0.6.103')).toBe('0.6.102')
    expect(appVersionOf('', '0.6.103')).toBe('0.6.103')
    expect(appVersionOf(undefined, '0.6.103')).toBe('0.6.103')
    expect(appVersionOf(undefined, undefined)).toBe('')
  })
})
