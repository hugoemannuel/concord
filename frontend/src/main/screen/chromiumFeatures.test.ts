import { describe, expect, it } from 'vitest'
import { chromiumFeatures } from './chromiumFeatures'

describe('chromiumFeatures', () => {
  it('Windows: captura WGC e AV1 por hardware no WebRTC (com o L1T3 que o LiveKit usa na tela)', () => {
    expect(chromiumFeatures('win32')).toEqual({
      enable:
        'AllowWgcWindowCapturer,AllowWgcScreenCapturer,WebRtcAV1HWEncode,D3D12VideoEncodeAcceleratorL1T3',
      disable: 'CalculateNativeWinOcclusion'
    })
  })

  it('Linux: codificação e decodificação por VA-API', () => {
    expect(chromiumFeatures('linux').enable).toBe(
      'AllowWgcWindowCapturer,AllowWgcScreenCapturer,AcceleratedVideoEncoder,AcceleratedVideoDecoder'
    )
  })

  it('Linux só com NVIDIA e o nvidia-vaapi-driver: decodificação VA-API liberada na NVIDIA', () => {
    expect(chromiumFeatures('linux', { nvidiaOnly: true, nvidiaVaapi: true }).enable).toBe(
      'AllowWgcWindowCapturer,AllowWgcScreenCapturer,AcceleratedVideoEncoder,AcceleratedVideoDecoder,' +
        'VaapiOnNvidiaGPUs,VaapiIgnoreDriverChecks,AcceleratedVideoDecodeLinuxGL'
    )
  })

  it('Linux com Intel/AMD, híbrido ou NVIDIA sem o driver: nada de NVIDIA', () => {
    const plain = chromiumFeatures('linux').enable
    expect(chromiumFeatures('linux', { nvidiaOnly: false, nvidiaVaapi: false }).enable).toBe(plain)
    expect(chromiumFeatures('linux', { nvidiaOnly: true, nvidiaVaapi: false }).enable).toBe(plain)
  })

  it('macOS: só o que já vinha (VideoToolbox já é o padrão)', () => {
    expect(chromiumFeatures('darwin').enable).toBe('AllowWgcWindowCapturer,AllowWgcScreenCapturer')
  })

  it('sem nome repetido: o Chromium só lê o último --enable-features', () => {
    for (const platform of ['win32', 'linux', 'darwin'] as const) {
      const gpu = { nvidiaOnly: true, nvidiaVaapi: true }
      const names = chromiumFeatures(platform, gpu).enable.split(',')
      expect(new Set(names).size).toBe(names.length)
    }
  })
})

describe('chromiumFeatures: H.265 que chega e não decodifica (ADR 0073)', () => {
  it('com a marca, o app não anuncia H.265 para receber (o servidor manda a reserva H.264)', () => {
    expect(chromiumFeatures('win32', null, false).disable).toBe(
      'CalculateNativeWinOcclusion,WebRtcAllowH265Receive'
    )
  })

  it('sem a marca, nada muda', () => {
    expect(chromiumFeatures('win32', null, true)).toEqual(chromiumFeatures('win32'))
  })
})
