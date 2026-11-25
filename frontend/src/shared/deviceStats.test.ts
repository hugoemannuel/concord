import { describe, expect, it } from 'vitest'
import { gpuStatusOf } from './deviceStats'

describe('gpuStatusOf', () => {
  it('aceleração desligada no app vence o que o Chromium diz', () => {
    expect(gpuStatusOf('enabled', false)).toBe('disabled')
  })

  it('composição na placa = enabled', () => {
    expect(gpuStatusOf('enabled', true)).toBe('enabled')
    expect(gpuStatusOf('enabled_on', true)).toBe('enabled')
    expect(gpuStatusOf('enabled_force', true)).toBe('enabled')
  })

  it('composição por software = software', () => {
    expect(gpuStatusOf('disabled_software', true)).toBe('software')
    expect(gpuStatusOf('unavailable_software', true)).toBe('software')
  })

  it('composição desligada = disabled', () => {
    expect(gpuStatusOf('disabled_off', true)).toBe('disabled')
    expect(gpuStatusOf('unavailable_off_ok', true)).toBe('disabled')
  })

  it('valor desconhecido ou ausente = não sabe', () => {
    expect(gpuStatusOf(undefined, true)).toBe('')
    expect(gpuStatusOf('novo_valor', true)).toBe('')
  })
})
