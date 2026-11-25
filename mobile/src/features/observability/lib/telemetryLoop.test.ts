import { createTelemetryLoop, inCall } from './telemetryLoop'

function setup() {
  const deps = { tick: jest.fn().mockResolvedValue(undefined), start: jest.fn(), stop: jest.fn() }
  return { deps, loop: createTelemetryLoop(deps, 20_000) }
}

describe('inCall', () => {
  it('só com a call em andamento e com id (tocando ou chamando alguém não conta)', () => {
    expect(inCall({ phase: 'connecting', callId: 'c1' })).toBe(true)
    expect(inCall({ phase: 'active', callId: 'c1' })).toBe(true)
    expect(inCall({ phase: 'reconnecting', callId: 'c1' })).toBe(true)
    expect(inCall({ phase: 'connecting', callId: '' })).toBe(false)
    expect(inCall({ phase: 'outgoing', callId: 'c1' })).toBe(false)
    expect(inCall({ phase: 'ringing', callId: 'c1' })).toBe(false)
    expect(inCall({ phase: 'idle', callId: null })).toBe(false)
  })
})

describe('createTelemetryLoop', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it('fora de call não acorda o aparelho: sem timer nem leitura', () => {
    const { deps, loop } = setup()
    loop.sync(false)
    jest.advanceTimersByTime(120_000)
    expect(deps.tick).not.toHaveBeenCalled()
    expect(deps.start).not.toHaveBeenCalled()
  })

  it('na call lê a cada 20 s; ao sair para, desliga os sinais e faz a última leitura', () => {
    const { deps, loop } = setup()
    loop.sync(true)
    loop.sync(true)
    expect(deps.start).toHaveBeenCalledTimes(1)
    jest.advanceTimersByTime(60_000)
    expect(deps.tick).toHaveBeenCalledTimes(3)
    loop.sync(false)
    expect(deps.stop).toHaveBeenCalledTimes(1)
    expect(deps.tick).toHaveBeenCalledTimes(4)
    jest.advanceTimersByTime(60_000)
    expect(deps.tick).toHaveBeenCalledTimes(4)
  })

  it('desmontar com a call no ar para o timer e os sinais', () => {
    const { deps, loop } = setup()
    loop.sync(true)
    loop.dispose()
    jest.advanceTimersByTime(60_000)
    expect(deps.tick).not.toHaveBeenCalled()
    expect(deps.stop).toHaveBeenCalledTimes(1)
    loop.dispose()
    expect(deps.stop).toHaveBeenCalledTimes(1)
  })
})
