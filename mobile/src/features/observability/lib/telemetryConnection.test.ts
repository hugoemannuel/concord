import { createCallEventLog } from './callEventLog'
import { createConnectionObserver } from './telemetryConnection'

function setup() {
  let now = 1000
  const log = createCallEventLog(() => now)
  const observer = createConnectionObserver(log, () => now)
  return { log, observer, at: (t: number) => (now = t) }
}

describe('createConnectionObserver', () => {
  it('tempo para entrar: de "entrando" até a voz conectar, levado uma vez', () => {
    const { observer, at } = setup()
    observer.observe('idle', 'connecting')
    at(3500)
    observer.observe('connecting', 'active')
    expect(observer.takeConnectMs()).toBe(2500)
    expect(observer.takeConnectMs()).toBeNull()
  })

  it('DM: conta do atender (entrando), não do tocar', () => {
    const { observer, at } = setup()
    observer.observe('idle', 'outgoing')
    at(20_000)
    observer.observe('outgoing', 'connecting')
    at(21_200)
    observer.observe('connecting', 'active')
    expect(observer.takeConnectMs()).toBe(1200)
  })

  it('caiu e voltou: reconectou com o tempo fora', () => {
    const { observer, log, at } = setup()
    observer.observe('connecting', 'active')
    at(10_000)
    observer.observe('active', 'reconnecting')
    at(14_500)
    observer.observe('reconnecting', 'active')
    expect(log.take()).toEqual([{ type: 'reconectou', detail: '4,5 s' }])
  })

  it('a mesma fase de novo não muda nada', () => {
    const { observer, log } = setup()
    observer.observe('active', 'active')
    expect(log.take()).toEqual([])
    expect(observer.takeConnectMs()).toBeNull()
  })
})
