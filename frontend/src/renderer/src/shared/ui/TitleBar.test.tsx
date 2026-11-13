import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import TitleBar from './TitleBar'

const mainCss = readFileSync(new URL('../../assets/main.css', import.meta.url), 'utf8')

describe('TitleBar', () => {
  it('mantém a marca "Salinha" no canto', () => {
    expect(renderToStaticMarkup(<TitleBar />)).toContain('Salinha')
  })

  it('mostra o conteúdo central (servidor aberto) junto da marca', () => {
    const html = renderToStaticMarkup(<TitleBar center={<span>Brothers</span>} />)
    expect(html).toContain('Salinha')
    expect(html).toMatch(/justify-center[^>]*><span>Brothers<\/span>/)
  })

  // Regressão: o arraste manual (setPosition via IPC) escondia o gesto do
  // Windows, e o Snap (borda, topo, desmaximizar arrastando) parava de
  // funcionar. A faixa precisa ser a barra de título nativa do sistema.
  it('é a região nativa de arrastar do sistema, para o Snap do Windows funcionar', () => {
    const html = renderToStaticMarkup(<TitleBar />)
    expect(html).toMatch(/^<div[^>]*class="[^"]*\bapp-drag\b/)
    expect(mainCss).toMatch(/\.app-drag\s*\{\s*-webkit-app-region:\s*drag;?\s*\}/)
  })
})
