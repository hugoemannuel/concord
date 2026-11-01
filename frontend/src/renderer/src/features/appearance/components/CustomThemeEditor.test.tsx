import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { CustomThemeEditor as Editor, Draft } from '../hooks/useCustomThemeEditor'
import { buildPalette } from '../lib/palette'
import { CustomThemeEditor } from './CustomThemeEditor'

const DRAFT: Draft = {
  id: 'red1',
  name: 'Rubro',
  accent: '#e11d48',
  background: '#2a0a0a',
  sidebar: '#1f0707',
  card: '#3b0d0d',
  text: '#ffffff',
  glow: '',
  isNew: true
}

function render(draft: Draft, error: string | null = null): string {
  const editor = { saving: false, error, update: vi.fn(), cancel: vi.fn(), submit: vi.fn(), removeDraft: vi.fn() }
  return renderToStaticMarkup(
    <CustomThemeEditor editor={editor as unknown as Editor} draft={draft} palette={buildPalette(draft)} />
  )
}

describe('CustomThemeEditor', () => {
  it('tema novo: nome, ponto de partida, as cinco cores, brilho, prévia e sem "Apagar"', () => {
    const html = render(DRAFT)
    for (const t of ['Novo tema', 'Nome', 'Começar de', 'Discord Escuro', 'Destaque', 'Fundo principal', 'Barra lateral', 'Cartões e menus', 'Texto', 'Brilho de fundo', 'Prévia', 'Salvar e usar', 'Cancelar']) {
      expect(html).toContain(t)
    }
    expect(html).toContain('data-theme="custom-draft"')
    expect(html).toContain('data-scheme="dark"')
    expect(html).not.toContain('Apagar tema')
    expect(html).not.toContain('Cor do brilho')
  })

  it('tema salvo: "Editar tema" e "Apagar tema"; com brilho, a cor dele', () => {
    const html = render({ ...DRAFT, isNew: false, glow: '#dc2626' })
    expect(html).toContain('Editar tema')
    expect(html).toContain('Apagar tema')
    expect(html).toContain('Cor do brilho')
  })

  it('avisa o ajuste de contraste e o erro de salvar', () => {
    const html = render({ ...DRAFT, text: '#3a0a0a' }, 'Não foi possível salvar')
    expect(html).toContain('Ajustamos o texto para dar para ler.')
    expect(html).toContain('role="alert"')
  })

  it('tema claro: o brilho explica que só vale no escuro', () => {
    expect(render({ ...DRAFT, background: '#ffffff', text: '#111111' })).toContain('O brilho só aparece nos temas escuros.')
  })
})
