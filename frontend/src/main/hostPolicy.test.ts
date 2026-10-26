import { describe, expect, it } from 'vitest'
import { deployInput, forgetHost, splitEvents } from './hostPolicy'

describe('splitEvents', () => {
  it('separa eventos completos e guarda a linha pela metade', () => {
    const { events, rest } = splitEvents(
      '{"type":"step","step":"connect","state":"running"}\nlog solto\n{"type":"ready","publicUrl":"https://1-2-3-4.sslip.io","mode":"vps"}\n{"type":"st'
    )
    expect(events).toEqual([
      { type: 'step', step: 'connect', state: 'running' },
      { type: 'ready', publicUrl: 'https://1-2-3-4.sslip.io', mode: 'vps' }
    ])
    expect(rest).toBe('{"type":"st')
  })

  it('ignora JSON que não é evento', () => {
    expect(splitEvents('{"type":"outro"}\n{"a":1}\n').events).toEqual([])
  })
})

describe('deployInput', () => {
  const known = '/perfil/vps_known_hosts'

  it('senha: monta a entrada do deploy com root por padrão', () => {
    const r = deployInput(
      { host: ' 74.0.5.252 ', user: '', auth: 'password', password: 's3nha', autoUpdate: true },
      known,
      '0.9.0'
    )
    expect(r).toEqual({
      input: {
        host: '74.0.5.252',
        user: 'root',
        password: 's3nha',
        autoUpdate: true,
        knownHosts: known,
        version: '0.9.0'
      }
    })
  })

  it('chave: exige o arquivo e leva a senha da chave se houver', () => {
    expect(deployInput({ host: '1.2.3.4', auth: 'key' }, known, '0.9.0')).toEqual({
      error: 'Escolha o arquivo da chave SSH.'
    })
    const r = deployInput(
      { host: '1.2.3.4', auth: 'key', keyPath: 'C:\\k\\id_ed25519', keyPassphrase: 'x' },
      known,
      '0.9.0'
    )
    expect('input' in r && r.input.keyPath).toBe('C:\\k\\id_ed25519')
    expect('input' in r && r.input.password).toBeUndefined()
  })

  it('recusa o que não serve', () => {
    expect(deployInput(null, known, '0.9.0')).toHaveProperty('error')
    expect(deployInput({ host: '' }, known, '0.9.0')).toHaveProperty('error')
    expect(deployInput({ host: 'http://1.2.3.4/' }, known, '0.9.0')).toHaveProperty('error')
    expect(deployInput({ host: '1.2.3.4', auth: 'password' }, known, '0.9.0')).toHaveProperty(
      'error'
    )
    expect(
      deployInput({ host: '1.2.3.4', password: 'x', domain: 'não é domínio' }, known, '0.9.0')
    ).toHaveProperty('error')
  })

  it('domínio próprio passa', () => {
    const r = deployInput(
      { host: '1.2.3.4', password: 'x', domain: 'salinha.exemplo.com' },
      known,
      '0.9.0'
    )
    expect('input' in r && r.input.domain).toBe('salinha.exemplo.com')
  })
})

describe('forgetHost', () => {
  it('tira só as linhas daquela VPS', () => {
    const file = [
      '74.0.5.252 ssh-ed25519 AAAA1',
      '[74.0.5.252]:2222 ssh-ed25519 AAAA2',
      '10.0.0.1 ssh-ed25519 AAAA3'
    ].join('\n')
    expect(forgetHost(file, '74.0.5.252')).toBe('10.0.0.1 ssh-ed25519 AAAA3')
  })
})
