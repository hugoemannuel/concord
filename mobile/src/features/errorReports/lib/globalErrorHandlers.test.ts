import { installGlobalHandler, installRejectionTracker, type GlobalHandler, type RejectionTrackerOptions } from './globalErrorHandlers'

function fakeErrorUtils() {
  const previous = jest.fn<void, [unknown, boolean | undefined]>()
  let handler: GlobalHandler = previous
  return {
    previous,
    errorUtils: { getGlobalHandler: () => handler, setGlobalHandler: (next: GlobalHandler) => (handler = next) },
    fire: (error: unknown, isFatal?: boolean) => handler(error, isFatal)
  }
}

describe('installGlobalHandler', () => {
  it('erro não fatal: registra e chama o handler anterior na hora', () => {
    const { errorUtils, previous, fire } = fakeErrorUtils()
    const record = jest.fn()
    installGlobalHandler(errorUtils, { record, flushFatal: jest.fn() })
    const error = new Error('x')
    fire(error, false)
    expect(record).toHaveBeenCalledWith(error)
    expect(previous).toHaveBeenCalledWith(error, false)
  })

  it('erro fatal: tenta mandar antes e só depois chama o anterior (com isFatal)', async () => {
    const { errorUtils, previous, fire } = fakeErrorUtils()
    let release = () => {}
    const flushFatal = jest.fn(() => new Promise<void>((resolve) => (release = resolve)))
    installGlobalHandler(errorUtils, { record: jest.fn(), flushFatal })
    const error = new Error('fatal')
    fire(error, true)
    expect(flushFatal).toHaveBeenCalled()
    expect(previous).not.toHaveBeenCalled()
    release()
    await Promise.resolve()
    await Promise.resolve()
    expect(previous).toHaveBeenCalledWith(error, true)
  })

  it('envio do fatal que falha: o anterior é chamado igual', async () => {
    const { errorUtils, previous, fire } = fakeErrorUtils()
    installGlobalHandler(errorUtils, { record: jest.fn(), flushFatal: () => Promise.reject(new Error('sem rede')) })
    fire(new Error('fatal'), true)
    await new Promise(process.nextTick)
    expect(previous).toHaveBeenCalledTimes(1)
  })

  it('record que lança não impede o anterior', () => {
    const { errorUtils, previous, fire } = fakeErrorUtils()
    installGlobalHandler(errorUtils, {
      record: () => {
        throw new Error('quebrou')
      },
      flushFatal: jest.fn()
    })
    fire(new Error('x'), false)
    expect(previous).toHaveBeenCalledTimes(1)
  })

  it('sem ErrorUtils (fora do RN): não faz nada', () => {
    expect(installGlobalHandler(undefined, { record: jest.fn(), flushFatal: jest.fn() })).toBe(false)
  })
})

describe('installRejectionTracker', () => {
  it('fora do dev: liga o rastreador do Hermes e registra a rejeição sem tratamento', () => {
    let options: RejectionTrackerOptions | undefined
    const hermes = { enablePromiseRejectionTracker: (next: RejectionTrackerOptions) => (options = next) }
    const record = jest.fn()
    expect(installRejectionTracker(hermes, record, false)).toBe(true)
    expect(options?.allRejections).toBe(true)
    options?.onUnhandled(1, 'motivo')
    options?.onHandled(1)
    expect(record).toHaveBeenCalledWith('motivo')
  })

  it('no dev não troca o rastreador do RN (o aviso do LogBox continua)', () => {
    const hermes = { enablePromiseRejectionTracker: jest.fn() }
    expect(installRejectionTracker(hermes, jest.fn(), true)).toBe(false)
    expect(hermes.enablePromiseRejectionTracker).not.toHaveBeenCalled()
  })

  it('sem Hermes (ou sem o rastreador): não faz nada', () => {
    expect(installRejectionTracker(null, jest.fn(), false)).toBe(false)
    expect(installRejectionTracker({}, jest.fn(), false)).toBe(false)
  })
})
