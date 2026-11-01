import { describe, expect, it } from 'vitest'
import {
  SPLASH_SKIP_HASH,
  isDarkColor,
  splashHtml,
  splashScript,
  splashStatus,
  wantsSkip
} from './splashPage'

const colors = { color: '#121214', symbolColor: '#96979e' }

describe('splashStatus', () => {
  it('um texto em português por fase', () => {
    expect(splashStatus({ phase: 'checking', percent: null, canSkip: false })).toBe(
      'Procurando atualizações…'
    )
    expect(splashStatus({ phase: 'downloading', percent: 42, canSkip: false })).toBe(
      'Baixando atualização… 42%'
    )
    expect(splashStatus({ phase: 'installing', percent: null, canSkip: false })).toBe('Instalando…')
    expect(splashStatus({ phase: 'opening', percent: null, canSkip: false })).toBe('Abrindo…')
  })

  it('baixando sem progresso ainda mostra 0%', () => {
    expect(splashStatus({ phase: 'downloading', percent: null, canSkip: false })).toBe(
      'Baixando atualização… 0%'
    )
  })
})

describe('splashScript', () => {
  it('manda só o texto, a barra e o botão, como JSON', () => {
    const script = splashScript({ phase: 'downloading', percent: 7, canSkip: true })
    expect(script).toBe(
      'window.mostrar({"status":"Baixando atualização… 7%","percent":7,"canSkip":true})'
    )
  })
})

describe('splashHtml', () => {
  const html = splashHtml({ logo: 'data:image/png;base64,AAAA', colors })

  it('página estática: nada de fora, scripts só os de dentro', () => {
    expect(html).toContain(
      "default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'"
    )
    expect(html).not.toMatch(/https?:\/\//)
    expect(html).toContain('lang="pt-BR"')
  })

  it('usa as cores do tema do app', () => {
    expect(html).toContain('#121214')
    expect(html).toContain('#96979e')
  })

  it('cor inválida (arquivo mexido) cai no tema escuro padrão', () => {
    const page = splashHtml({
      logo: 'data:image/png;base64,AAAA',
      colors: { color: 'red;}</style><script>', symbolColor: '#fff' }
    })
    expect(page).not.toContain('</style><script>')
    expect(page).toContain('#121214')
  })

  it('logo que não é imagem em data: fica de fora', () => {
    const page = splashHtml({ logo: '"><script>alert(1)</script>', colors })
    expect(page).not.toContain('alert(1)')
  })

  it('o botão "Abrir sem atualizar" navega só dentro da página', () => {
    expect(html).toContain('Abrir sem atualizar')
    expect(html).toContain(SPLASH_SKIP_HASH)
  })

  it('status anunciado para leitor de tela', () => {
    expect(html).toContain('role="status"')
  })
})

describe('isDarkColor', () => {
  it('separa fundo escuro de claro (cor do título)', () => {
    expect(isDarkColor('#121214')).toBe(true)
    expect(isDarkColor('#f2f3f5')).toBe(false)
    expect(isDarkColor('#5865f2')).toBe(true)
  })
})

describe('wantsSkip', () => {
  it('só o hash do botão pede para pular', () => {
    expect(wantsSkip(`data:text/html,abc${SPLASH_SKIP_HASH}`)).toBe(true)
    expect(wantsSkip('data:text/html,abc#outra')).toBe(false)
    expect(wantsSkip('data:text/html,abc')).toBe(false)
  })
})
