import { afterEach, describe, expect, it } from 'vitest'
import {
  createMainErrorQueue,
  describeThrown,
  helperExitMessage,
  isCleanExit,
  mainErrors,
  MAX_MAIN_ERRORS,
  processGoneMessage,
  reportHelperExit,
  reportMainError
} from './mainErrors'

afterEach(() => mainErrors.take())

describe('createMainErrorQueue', () => {
  it('o mesmo erro soma a contagem; take esvazia', () => {
    const queue = createMainErrorQueue()
    queue.add('TypeError', 'x', 'TypeError: x\n    at f (out/main/index.js:1:2)')
    queue.add('TypeError', 'x', 'TypeError: x\n    at f (out/main/index.js:1:2)')
    expect(queue.take()).toEqual([
      { kind: 'TypeError', message: 'x', stack: 'TypeError: x\n    at f (out/main/index.js:1:2)', count: 2 }
    ])
    expect(queue.take()).toEqual([])
  })

  it('até 20 erros distintos; os outros são descartados, os já guardados seguem contando', () => {
    const queue = createMainErrorQueue()
    for (let i = 0; i < MAX_MAIN_ERRORS + 5; i++) queue.add('Error', `e${i}`)
    queue.add('Error', 'e0')
    const errors = queue.take()
    expect(errors).toHaveLength(MAX_MAIN_ERRORS)
    expect(errors[0].count).toBe(2)
  })

  it('sai limpo (caminho do usuário e pacote)', () => {
    const queue = createMainErrorQueue()
    queue.add(
      'Error',
      'falhou em C:\\Users\\Ana Maria\\x.txt',
      'Error: x\n    at f (C:\\Users\\Ana Maria\\AppData\\Local\\Programs\\Salinha\\resources\\app.asar\\out\\main\\index.js:10:5)'
    )
    expect(queue.take()[0]).toMatchObject({
      message: 'falhou em C:\\Users\\<user>\\x.txt',
      stack: 'Error: x\n    at f (out/main/index.js:10:5)'
    })
  })
})

describe('reportMainError', () => {
  it.each([
    ['Error', new RangeError('fora'), { kind: 'RangeError', message: 'fora' }],
    ['valor qualquer', 'texto', { kind: 'NonError', message: 'texto', stack: '' }]
  ])('%s', (_name, value, want) => {
    expect(describeThrown(value)).toMatchObject(want)
  })

  it('guarda na fila do processo', () => {
    reportMainError(new Error('quebrou'))
    expect(mainErrors.take()).toMatchObject([{ kind: 'Error', message: 'quebrou', count: 1 }])
  })

  it.each([
    'net::ERR_INTERNET_DISCONNECTED',
    'getaddrinfo ENOTFOUND app-salinha.bhrx.com.br',
    'connect ECONNREFUSED 127.0.0.1:8080'
  ])('rede esperada não vai: %s', (message) => {
    reportMainError(new Error(message))
    expect(mainErrors.take()).toEqual([])
  })
})

describe('saída dos helpers e processos', () => {
  it.each([
    ['código', 'concord-live', 3, null, 'concord-live saiu sem avisar (código 3)'],
    ['sinal', 'concord-audio', null, 'SIGKILL', 'concord-audio saiu sem avisar (sinal SIGKILL)'],
    ['sem nada', 'overlay', null, null, 'overlay saiu sem avisar (código ?)']
  ])('%s', (_name, name, code, signal, want) => {
    expect(helperExitMessage(name, code, signal)).toBe(want)
  })

  it('reportHelperExit guarda como helper-exit', () => {
    reportHelperExit('concord-live', 134)
    expect(mainErrors.take()).toEqual([
      { kind: 'helper-exit', message: 'concord-live saiu sem avisar (código 134)', stack: '', count: 1 }
    ])
  })

  it.each([
    ['renderer', { reason: 'crashed', exitCode: 1 }, 'renderer crashed (código 1)'],
    ['GPU', { reason: 'oom', exitCode: -5, type: 'GPU' }, 'GPU oom (código -5)'],
    [
      'utilitário com nome',
      { reason: 'killed', exitCode: 9, type: 'Utility', name: 'Audio Service' },
      'Utility Audio Service killed (código 9)'
    ]
  ])('processo que caiu: %s', (_name, details, want) => {
    expect(processGoneMessage(details)).toBe(want)
  })

  it('clean-exit não é erro', () => {
    expect(isCleanExit({ reason: 'clean-exit', exitCode: 0 })).toBe(true)
    expect(isCleanExit({ reason: 'crashed', exitCode: 1 })).toBe(false)
  })
})
