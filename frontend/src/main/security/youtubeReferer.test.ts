import { describe, expect, it, vi } from 'vitest'
import { setupYouTubeReferer, type HeadersSession } from './youtubeReferer'

type Listener = Parameters<HeadersSession['webRequest']['onBeforeSendHeaders']>[1]

function fakeSession() {
  const s = {
    filter: undefined as { urls: string[] } | undefined,
    listener: undefined as Listener | undefined,
    webRequest: {
      onBeforeSendHeaders: vi.fn((filter: { urls: string[] }, listener: Listener) => {
        s.filter = filter
        s.listener = listener
      })
    }
  }
  return s
}

function send(ses: ReturnType<typeof fakeSession>, requestHeaders: Record<string, string>) {
  const callback = vi.fn()
  ses.listener!({ requestHeaders }, callback)
  return callback.mock.calls[0][0].requestHeaders
}

describe('setupYouTubeReferer', () => {
  it('só escuta o player do YouTube sem cookies', () => {
    const ses = fakeSession()
    setupYouTubeReferer(ses, ['https://salinha.exemplo/api'])
    expect(ses.filter).toEqual({ urls: ['https://www.youtube-nocookie.com/*'] })
  })

  it('sem Referer (app instalado): manda a origem do primeiro servidor do build', () => {
    const ses = fakeSession()
    setupYouTubeReferer(ses, ['https://salinha.exemplo/api', 'https://outro.exemplo'])
    expect(send(ses, { Accept: '*/*' })).toEqual({ Accept: '*/*', Referer: 'https://salinha.exemplo/' })
  })

  it('com Referer (web, dev): não mexe', () => {
    const ses = fakeSession()
    setupYouTubeReferer(ses, ['https://salinha.exemplo'])
    expect(send(ses, { Referer: 'http://localhost:5173/' })).toEqual({ Referer: 'http://localhost:5173/' })
  })

  it('build sem servidor válido: não escuta nada', () => {
    const ses = fakeSession()
    setupYouTubeReferer(ses, ['nao é url'])
    expect(ses.webRequest.onBeforeSendHeaders).not.toHaveBeenCalled()
  })
})
