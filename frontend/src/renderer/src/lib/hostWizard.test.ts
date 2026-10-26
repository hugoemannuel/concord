import { describe, expect, it } from 'vitest'
import { initialHostWizard, reduceHostEvent, type HostWizardState } from './hostWizard'
import type { HostEvent } from '../../../shared/hostServer'

const run = (events: HostEvent[]): HostWizardState =>
  events.reduce(reduceHostEvent, initialHostWizard())

describe('reduceHostEvent', () => {
  it('acompanha as etapas e junta os avisos sem repetir', () => {
    const s = run([
      { type: 'step', step: 'connect', state: 'done' },
      { type: 'step', step: 'setup', state: 'running', warning: 'sem ffmpeg' },
      { type: 'step', step: 'setup', state: 'running', warning: 'sem ffmpeg' },
      { type: 'step', step: 'setup', state: 'done' }
    ])
    expect(s.steps.connect).toBe('done')
    expect(s.steps.setup).toBe('done')
    expect(s.notes).toEqual(['sem ffmpeg'])
  })

  it('erro da etapa vale mais que o erro geral que vem depois', () => {
    const s = run([
      {
        type: 'step',
        step: 'connect',
        state: 'error',
        message: 'usuário, senha ou chave recusados'
      },
      { type: 'error', message: 'Process exited with status 1' }
    ])
    expect(s.error).toBe('usuário, senha ou chave recusados')
    expect(s.hostKeyChanged).toBe(false)
  })

  it('identidade da VPS mudou: pede confirmação', () => {
    const s = run([
      {
        type: 'error',
        message: 'a identidade desta VPS mudou desde a última vez (ela foi reinstalada?)'
      }
    ])
    expect(s.hostKeyChanged).toBe(true)
  })

  it('pronto guarda o endereço e limpa o erro', () => {
    const s = run([
      { type: 'error', message: 'falhou' },
      { type: 'ready', publicUrl: 'https://1-2-3-4.sslip.io', mode: 'vps' }
    ])
    expect(s.publicUrl).toBe('https://1-2-3-4.sslip.io')
    expect(s.error).toBeNull()
  })
})
