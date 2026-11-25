import { describe, expect, it } from 'vitest'
import {
  cpuLabel,
  deviceLine,
  gpuShortName,
  mbLabel,
  msLabel,
  perMinLabel,
  stateLabel,
  summaryLine,
  versionLabel,
  type DeviceNumbers
} from './deviceFormat'

describe('unidades', () => {
  it('CPU em % da máquina', () => {
    expect(cpuLabel(18.24)).toBe('18,2%')
    expect(cpuLabel(0)).toBe('0%')
    expect(cpuLabel(null)).toBe('—')
  })
  it('memória em MB e, de 1 GB para cima, em GB', () => {
    expect(mbLabel(820)).toBe('820 MB')
    expect(mbLabel(1450)).toBe('1,4 GB')
    expect(mbLabel(16000)).toBe('15,6 GB')
    expect(mbLabel(null)).toBe('—')
  })
  it('tempo em ms e, de 1 s para cima, em s', () => {
    expect(msLabel(140)).toBe('140 ms')
    expect(msLabel(9000)).toBe('9 s')
    expect(msLabel(2300)).toBe('2,3 s')
    expect(msLabel(null)).toBe('—')
    expect(perMinLabel(2300)).toBe('2,3 s/min')
    expect(perMinLabel(null)).toBe('—')
  })
})

describe('rótulos', () => {
  it('estado do app', () => {
    expect(stateLabel('parado')).toBe('Parado')
    expect(stateLabel('call')).toBe('Em call')
    expect(stateLabel('transmitindo')).toBe('Transmitindo')
    expect(stateLabel('outro')).toBe('outro')
  })
  it('versão com o alvo', () => {
    expect(versionLabel('1.40.0', 'desktop')).toBe('1.40.0 · desktop')
    expect(versionLabel('1.40.0', 'web')).toBe('1.40.0 · web')
    expect(versionLabel('', '')).toBe('—')
  })
  it('pessoas e linhas no período', () => {
    expect(summaryLine(12, 3400)).toBe('12 pessoas · 3.400 linhas no período')
    expect(summaryLine(1, 1)).toBe('1 pessoa · 1 linha no período')
  })
})

describe('gpuShortName', () => {
  it('tira o ANGLE, o fabricante, a API e o id do aparelho', () => {
    expect(
      gpuShortName('ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 Direct3D11 vs_5_0 ps_5_0, D3D11)')
    ).toBe('NVIDIA GeForce RTX 3070')
    expect(
      gpuShortName(
        'ANGLE (NVIDIA, NVIDIA GeForce GTX 1060 6GB (0x00001C03) Direct3D11 vs_5_0 ps_5_0, D3D11)'
      )
    ).toBe('NVIDIA GeForce GTX 1060 6GB')
    expect(
      gpuShortName('ANGLE (Intel, Mesa Intel(R) UHD Graphics 620 (KBL GT2), OpenGL 4.6)')
    ).toBe('Mesa Intel(R) UHD Graphics 620 (KBL GT2)')
    expect(gpuShortName('ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)')).toBe(
      'Apple M1'
    )
  })
  it('fora do ANGLE fica como veio; vazio vira traço', () => {
    expect(gpuShortName('llvmpipe (LLVM 15.0.7, 256 bits)')).toBe(
      'llvmpipe (LLVM 15.0.7, 256 bits)'
    )
    expect(gpuShortName('ANGLE (Google)')).toBe('Google')
    expect(gpuShortName('')).toBe('—')
  })
})

const numbers: DeviceNumbers = {
  cpu_app: 18.2,
  cpu_renderer_call: 22,
  mem_app_mb: 1450,
  mem_free_min_mb: 600,
  mem_total_mb: 8000,
  lag_p95_ms: 140,
  long_ms_per_min: 2300,
  hangs: 1,
  startup_ms: 9000
}

describe('deviceLine', () => {
  it('junta os números do aparelho numa linha', () => {
    expect(deviceLine(numbers)).toBe(
      'CPU do app 18,2% · renderer em call 22% · memória do app 1,4 GB · livre mín. 600 MB de 7,8 GB · atraso p95 140 ms · travadas 2,3 s/min · janela parou 1 vez · abertura 9 s'
    )
  })
  it('pula o que não foi medido e a janela que nunca parou', () => {
    expect(
      deviceLine({
        ...numbers,
        cpu_renderer_call: null,
        mem_total_mb: null,
        lag_p95_ms: null,
        long_ms_per_min: null,
        hangs: 0,
        startup_ms: null
      })
    ).toBe('CPU do app 18,2% · memória do app 1,4 GB · livre mín. 600 MB')
  })
  it('plural das vezes e linha vazia sem dado', () => {
    expect(deviceLine({ ...numbers, hangs: 3 })).toContain('janela parou 3 vezes')
    expect(
      deviceLine({
        cpu_app: null,
        cpu_renderer_call: null,
        mem_app_mb: null,
        mem_free_min_mb: null,
        mem_total_mb: null,
        lag_p95_ms: null,
        long_ms_per_min: null,
        hangs: 0,
        startup_ms: null
      })
    ).toBe('')
  })
})
