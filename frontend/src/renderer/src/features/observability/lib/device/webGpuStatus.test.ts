import { describe, expect, it } from 'vitest'
import { webGpuStatus } from './webGpuStatus'

describe('webGpuStatus', () => {
  it('renderer por software no WebGL = software', () => {
    expect(
      webGpuStatus('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device), SwiftShader driver)')
    ).toBe('software')
    expect(webGpuStatus('llvmpipe (LLVM 15.0.7, 256 bits)')).toBe('software')
    expect(webGpuStatus('softpipe')).toBe('software')
    expect(webGpuStatus('Microsoft Basic Render Driver (Software)')).toBe('software')
  })

  it('placa de verdade = enabled; sem nome = não sabe', () => {
    expect(webGpuStatus('ANGLE (NVIDIA, NVIDIA GeForce RTX 3070)')).toBe('enabled')
    expect(webGpuStatus('')).toBe('')
  })
})
