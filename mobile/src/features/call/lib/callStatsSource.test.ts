import { clearActiveCallStats, readActiveAudioOutputs, readActiveCall, readActiveScreen, setActiveCallStats, type CallStatsReader } from './callStatsSource'

const reader = (): CallStatsReader => ({
  readScreen: jest.fn().mockResolvedValue({ report: new Map(), streamState: 'active', requestedFps: null }),
  readCall: jest.fn().mockResolvedValue(new Map([['a', { type: 'inbound-rtp' }]])),
  readAudioOutputs: jest.fn().mockResolvedValue(['speaker'])
})

describe('callStatsSource', () => {
  it('sem chamada registrada, nada para ler', async () => {
    expect(await readActiveCall()).toBeNull()
    expect(await readActiveScreen('u1', false)).toBeNull()
    expect(await readActiveAudioOutputs()).toEqual([])
  })

  it('lê da chamada registrada e para de ler quando ela sai', async () => {
    const r = reader()
    setActiveCallStats(r)
    expect((await readActiveCall())?.get('a')).toEqual({ type: 'inbound-rtp' })
    expect(await readActiveScreen('u1', true)).toMatchObject({ streamState: 'active' })
    expect(r.readScreen).toHaveBeenCalledWith('u1', true)
    expect(await readActiveAudioOutputs()).toEqual(['speaker'])
    clearActiveCallStats(r)
    expect(await readActiveCall()).toBeNull()
  })

  it('uma chamada velha saindo não tira a nova', async () => {
    const old = reader()
    const current = reader()
    setActiveCallStats(old)
    setActiveCallStats(current)
    clearActiveCallStats(old)
    expect(await readActiveCall()).not.toBeNull()
    clearActiveCallStats(current)
  })

  it('leitura que não responde em 5 s desiste (a telemetria não trava)', async () => {
    jest.useFakeTimers()
    const r = { ...reader(), readCall: jest.fn(() => new Promise<never>(() => {})) }
    setActiveCallStats(r)
    const reading = readActiveCall()
    jest.advanceTimersByTime(5000)
    expect(await reading).toBeNull()
    clearActiveCallStats(r)
    jest.useRealTimers()
  })

  it('erro ao ler as saídas de áudio vira lista vazia', async () => {
    const r = { ...reader(), readAudioOutputs: jest.fn().mockRejectedValue(new Error('sem sessão')) }
    setActiveCallStats(r)
    expect(await readActiveAudioOutputs()).toEqual([])
    clearActiveCallStats(r)
  })
})
