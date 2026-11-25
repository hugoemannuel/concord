import { durationText, type CallEventLog } from './callEventLog'

// Sinais só do celular durante a call (docs/adr/0070), cada um com a sua pergunta: a call seguiu com o app em
// segundo plano? caiu ao trocar Wi-Fi ↔ dados? a queixa de áudio é do Bluetooth ou do alto-falante? Puro: quem
// ouve o AppState e o NetInfo é o hook.

/** Ordem em que o AudioSwitch do LiveKit escolhe a saída (o app nunca escolhe à mão). */
const ROUTE_PRIORITY = ['bluetooth', 'headset', 'speaker', 'earpiece']

export interface NetInfoLike {
  type: string
  details?: { cellularGeneration?: string | null } | object | null
}

/** 'wifi', 'cellular-4g', 'cellular', 'none'... */
export function networkLabel(state: NetInfoLike): string {
  if (state.type !== 'cellular') return state.type
  const generation = (state.details as { cellularGeneration?: string | null } | null)?.cellularGeneration
  return generation ? `cellular-${generation}` : 'cellular'
}

/** A saída de áudio em uso, inferida das disponíveis; '' sem dado. */
export function audioRoute(outputs: string[]): string {
  return ROUTE_PRIORITY.find((route) => outputs.includes(route)) ?? ''
}

export function createDeviceSignals(log: CallEventLog, now: () => number = Date.now) {
  let backgroundSince: number | null = null
  let network: string | null = null
  let route = ''
  let current = ''

  return {
    appState(state: string): void {
      if (state === 'background' && backgroundSince === null) {
        backgroundSince = now()
        log.add('segundo_plano')
      } else if (state === 'active' && backgroundSince !== null) {
        log.add('primeiro_plano', durationText(now() - backgroundSince))
        backgroundSince = null
      }
    },
    network(label: string): void {
      if (network !== null && label !== network) log.add('rede_trocou', `${network} → ${label}`)
      network = label
      current = label
    },
    route(outputs: string[]): void {
      const next = audioRoute(outputs)
      if (next && next !== route) log.add('rota_do_audio', next)
      route = next || route
    },
    currentNetwork: (): string => current,
    /** Call nova: sem segundo plano pendente, rota a anotar de novo, rede como base. */
    reset(): void {
      backgroundSince = null
      network = null
      route = ''
    }
  }
}

export type DeviceSignals = ReturnType<typeof createDeviceSignals>
