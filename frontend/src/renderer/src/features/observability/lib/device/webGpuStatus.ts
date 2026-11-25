import type { GpuStatus } from '../../../../../../shared/deviceStats'

// No app web não há getGPUFeatureStatus: o nome do renderer do WebGL diz se
// a "placa" é uma emulação por software.

const SOFTWARE = /SwiftShader|llvmpipe|softpipe|Software/i

export function webGpuStatus(rendererName: string): GpuStatus {
  if (!rendererName) return ''
  return SOFTWARE.test(rendererName) ? 'software' : 'enabled'
}
