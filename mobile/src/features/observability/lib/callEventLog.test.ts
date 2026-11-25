import { createCallEventLog } from './callEventLog'

describe('createCallEventLog', () => {
  it('junta os eventos na ordem e limpa ao levar', () => {
    const log = createCallEventLog(() => 0)
    log.add('segundo_plano')
    log.add('reconectou', '3 s')
    expect(log.take()).toEqual([
      { type: 'segundo_plano', detail: '' },
      { type: 'reconectou', detail: '3 s' }
    ])
    expect(log.take()).toEqual([])
  })

  it('guarda no máximo 8 (os mais novos) e descarta os de mais de 5 min', () => {
    let now = 0
    const log = createCallEventLog(() => now)
    log.add('velho')
    now = 6 * 60_000
    for (let i = 0; i < 10; i++) log.add(`e${i}`)
    expect(log.take().map((e) => e.type)).toEqual(['e2', 'e3', 'e4', 'e5', 'e6', 'e7', 'e8', 'e9'])
  })

  it('diz se há algo guardado sem levar', () => {
    const log = createCallEventLog(() => 0)
    expect(log.pending()).toBe(false)
    log.add('rede_trocou', 'wifi → none')
    expect(log.pending()).toBe(true)
  })
})
