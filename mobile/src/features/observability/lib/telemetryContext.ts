import Constants from 'expo-constants'
import { Platform } from 'react-native'
import type { ClientContext } from './telemetryTypes'

// Contexto técnico de quem manda a telemetria no Android (docs/adr/0070): a versão do Android, a do app, o
// fabricante e o modelo (Platform.constants, sem dependência nova) e o tipo de rede (NetInfo, vem de fora).
// Placa de vídeo e núcleos não têm API no React Native: vazio e 0.

export interface ContextInput {
  release: string
  version: string
  manufacturer: string
  model: string
  network: string
}

function deviceName(manufacturer: string, model: string): string {
  if (manufacturer && model.toLowerCase().startsWith(manufacturer.toLowerCase())) return model
  return [manufacturer, model].filter(Boolean).join(' ')
}

export function buildClientContext(input: ContextInput): ClientContext {
  return {
    os: input.release ? `Android ${input.release}` : 'Android',
    app_version: input.version,
    target: 'android',
    gpu: '',
    network: input.network,
    cores: 0,
    device: deviceName(input.manufacturer, input.model)
  }
}

interface AndroidConstants {
  Release?: string
  Manufacturer?: string
  Model?: string
}

/** O contexto agora (a rede muda; o resto é do aparelho). */
export function loadClientContext(network: string): ClientContext {
  const c = Platform.constants as AndroidConstants
  return buildClientContext({
    release: String(c.Release ?? ''),
    version: Constants.expoConfig?.version ?? '',
    manufacturer: c.Manufacturer ?? '',
    model: c.Model ?? '',
    network
  })
}
