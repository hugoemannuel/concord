import { describe, expect, it } from 'vitest'
import { parseWindowed, visibleWindowScript } from './visibleWindows'

describe('visibleWindowScript', () => {
  it('pergunta pelos processos sem o .exe e só com janela visível', () => {
    const script = visibleWindowScript(['robloxplayerbeta.exe'])
    expect(script).toContain("Get-Process -Name 'robloxplayerbeta'")
    expect(script).toContain('MainWindowHandle -ne 0')
  })

  it('sai com 0 mesmo quando um dos processos não existe (senão cairia no plano B)', () => {
    expect(visibleWindowScript(['robloxplayerbeta.exe']).trimEnd()).toMatch(/; exit 0$/)
  })

  it('não deixa aspas do nome escaparem do script', () => {
    expect(visibleWindowScript(["x'; stop-computer; '.exe"])).toContain("'x''; stop-computer; '''")
  })

  it('pergunta uma vez só por processo, mesmo com vários abertos', () => {
    expect(visibleWindowScript(['robloxplayerbeta.exe', 'RobloxPlayerBeta.exe'])).toContain(
      "-Name 'robloxplayerbeta' -ErrorAction"
    )
  })
})

describe('parseWindowed', () => {
  it('lê um processo por linha, em minúsculas e com .exe', () => {
    expect(parseWindowed('RobloxPlayerBeta\r\n\r\n')).toEqual(new Set(['robloxplayerbeta.exe']))
  })

  it('sem nenhuma janela, conjunto vazio', () => {
    expect(parseWindowed('')).toEqual(new Set())
  })
})
