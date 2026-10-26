import { HOST_KEY_CHANGED, type HostEvent, type HostStep } from '../../../shared/hostServer'

// Estado do assistente "Hospedar um servidor" a partir dos eventos do main.

export type StepState = 'pending' | 'running' | 'done' | 'error'

export const HOST_STEPS: { id: HostStep; label: string }[] = [
  { id: 'connect', label: 'Conectando à VPS' },
  { id: 'download', label: 'Baixando o servidor' },
  { id: 'setup', label: 'Preparando a VPS' },
  { id: 'database', label: 'Criando o banco de dados' },
  { id: 'https', label: 'Preparando o HTTPS' },
  { id: 'start', label: 'Ligando o servidor' },
  { id: 'check', label: 'Conferindo pela internet' }
]

export interface HostWizardState {
  steps: Record<HostStep, StepState>
  /** Avisos que não impedem (firewall, bot de música). */
  notes: string[]
  /** Endereço público já conferido de fora. */
  publicUrl: string | null
  error: string | null
  /** A VPS mudou de identidade (reinstalada?): a pessoa precisa confirmar. */
  hostKeyChanged: boolean
}

export function initialHostWizard(): HostWizardState {
  return {
    steps: {
      connect: 'pending',
      download: 'pending',
      setup: 'pending',
      database: 'pending',
      https: 'pending',
      start: 'pending',
      check: 'pending'
    },
    notes: [],
    publicUrl: null,
    error: null,
    hostKeyChanged: false
  }
}

function withError(state: HostWizardState, message: string): HostWizardState {
  return { ...state, error: message, hostKeyChanged: message.includes(HOST_KEY_CHANGED) }
}

export function reduceHostEvent(state: HostWizardState, event: HostEvent): HostWizardState {
  switch (event.type) {
    case 'step': {
      const next: HostWizardState = {
        ...state,
        steps: { ...state.steps, [event.step]: event.state },
        notes:
          event.warning && !state.notes.includes(event.warning)
            ? [...state.notes, event.warning]
            : state.notes
      }
      return event.state === 'error' ? withError(next, event.message ?? 'Algo deu errado.') : next
    }
    case 'ready':
      return { ...state, publicUrl: event.publicUrl, error: null, hostKeyChanged: false }
    case 'error':
      // O erro da etapa já veio com a mensagem certa; o geral só se não houver.
      return state.error ? state : withError(state, event.message)
  }
}
