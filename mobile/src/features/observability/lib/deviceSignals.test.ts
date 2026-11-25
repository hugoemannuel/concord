import { createCallEventLog } from './callEventLog'
import { audioRoute, createDeviceSignals, networkLabel } from './deviceSignals'

function setup() {
  let now = 0
  const log = createCallEventLog(() => now)
  return { log, signals: createDeviceSignals(log, () => now), at: (t: number) => (now = t) }
}

describe('networkLabel', () => {
  it('Wi-Fi, dados móveis com a geração, sem rede', () => {
    expect(networkLabel({ type: 'wifi', details: { isConnectionExpensive: false } })).toBe('wifi')
    expect(networkLabel({ type: 'cellular', details: { cellularGeneration: '4g' } })).toBe('cellular-4g')
    expect(networkLabel({ type: 'cellular', details: { cellularGeneration: null } })).toBe('cellular')
    expect(networkLabel({ type: 'none', details: null })).toBe('none')
  })
})

describe('audioRoute', () => {
  it('a saída que o LiveKit escolhe: Bluetooth > fone com fio > alto-falante > auricular', () => {
    expect(audioRoute(['earpiece', 'speaker', 'bluetooth'])).toBe('bluetooth')
    expect(audioRoute(['speaker', 'headset', 'earpiece'])).toBe('headset')
    expect(audioRoute(['earpiece', 'speaker'])).toBe('speaker')
    expect(audioRoute(['earpiece'])).toBe('earpiece')
    expect(audioRoute([])).toBe('')
  })
})

describe('createDeviceSignals', () => {
  it('saiu do app e voltou: segundo plano e primeiro plano com o tempo fora', () => {
    const { log, signals, at } = setup()
    signals.appState('inactive')
    signals.appState('background')
    signals.appState('background')
    at(90_000)
    signals.appState('active')
    expect(log.take()).toEqual([
      { type: 'segundo_plano', detail: '' },
      { type: 'primeiro_plano', detail: '1,5 min' }
    ])
  })

  it('pouco tempo fora vai em segundos', () => {
    const { log, signals, at } = setup()
    signals.appState('background')
    at(12_300)
    signals.appState('active')
    expect(log.take()[1]).toEqual({ type: 'primeiro_plano', detail: '12,3 s' })
  })

  it('trocou de rede no meio da call (a primeira leitura é só a base)', () => {
    const { log, signals } = setup()
    signals.network('wifi')
    signals.network('wifi')
    signals.network('cellular-4g')
    expect(log.take()).toEqual([{ type: 'rede_trocou', detail: 'wifi → cellular-4g' }])
    expect(signals.currentNetwork()).toBe('cellular-4g')
  })

  it('rota do áudio: a primeira e cada troca', () => {
    const { log, signals } = setup()
    signals.route(['speaker', 'earpiece'])
    signals.route(['speaker', 'earpiece'])
    signals.route(['speaker', 'bluetooth'])
    signals.route([])
    expect(log.take()).toEqual([
      { type: 'rota_do_audio', detail: 'speaker' },
      { type: 'rota_do_audio', detail: 'bluetooth' }
    ])
  })

  it('call nova começa do zero (a rede atual continua conhecida)', () => {
    const { log, signals } = setup()
    signals.network('wifi')
    signals.route(['speaker'])
    signals.appState('background')
    log.take()
    signals.reset()
    signals.network('wifi')
    signals.route(['speaker'])
    signals.appState('active')
    expect(log.take()).toEqual([{ type: 'rota_do_audio', detail: 'speaker' }])
    expect(signals.currentNetwork()).toBe('wifi')
  })
})
