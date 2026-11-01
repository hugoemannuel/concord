import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import Register from './Register'

const render = (path = '/register'): string =>
  renderToStaticMarkup(
    <MemoryRouter initialEntries={[path]}>
      <Register />
    </MemoryRouter>
  )

describe('Register', () => {
  it('mostra o aceite dos Termos e da Política, com os links, antes do Continuar', () => {
    const html = render()
    expect(html).toContain('Ao criar a conta você concorda com os')
    expect(html).toContain('href="https://salinha.bhrx.com.br/termos.html"')
    expect(html).toContain('href="https://salinha.bhrx.com.br/privacidade.html"')
    expect(html.indexOf('termos.html')).toBeLessThan(html.indexOf('Continuar'))
  })

  it('vindo de um convite, avisa que a conta é para aceitar o convite', () => {
    expect(render('/register?convite=K7P2QX9M')).toContain('Crie sua conta para aceitar o convite.')
  })
})
