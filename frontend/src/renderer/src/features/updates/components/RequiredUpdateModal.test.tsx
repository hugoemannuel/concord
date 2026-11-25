import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
vi.mock('../../call/store/callStore', () => ({ useCallStore: () => undefined }))

import { RequiredUpdateContent } from './RequiredUpdateModal'

const base = {
  installed: '1.1.0',
  minVersion: '1.2.0',
  status: 'idle',
  progress: 0,
  error: null,
  onUpdate: () => {}
} as const

const render = (over: Partial<Parameters<typeof RequiredUpdateContent>[0]> = {}): string =>
  renderToStaticMarkup(<RequiredUpdateContent {...base} {...over} />)

describe('RequiredUpdateContent', () => {
  it('diz a versão instalada, a mínima e oferece só atualizar', () => {
    const html = render()
    expect(html).toContain('v1.1.0')
    expect(html).toContain('v1.2.0')
    expect(html).toContain('Atualizar agora')
    expect(html.match(/<button/g)).toHaveLength(1)
  })

  it('procurando, baixando com a barra e reiniciando', () => {
    expect(render({ status: 'searching' })).toContain('Procurando a versão nova…')
    const downloading = render({ status: 'downloading', progress: 42 })
    expect(downloading).toContain('Baixando a atualização… 42%')
    expect(downloading).toContain('width:42%')
    expect(render({ status: 'restarting' })).toContain('Reiniciando para instalar…')
  })

  it('erro aparece e o botão volta', () => {
    const html = render({ error: 'Falhou o download.' })
    expect(html).toContain('Falhou o download.')
    expect(html).toContain('Atualizar agora')
  })
})
