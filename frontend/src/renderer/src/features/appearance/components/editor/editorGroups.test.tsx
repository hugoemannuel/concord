import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { buildPalette } from '../../lib/palette'
import { PRESET_SEEDS } from '../../lib/presetSeeds'
import type { Draft } from '../../store/themeEditorStore'
import { ColorsGroup } from './ColorsGroup'
import { EffectsGroup } from './EffectsGroup'
import { FillField } from './FillField'
import { ShapeGroup } from './ShapeGroup'
import { StartGroup } from './StartGroup'

const DRAFT: Draft = { id: 'x', name: 'Meu tema', ...PRESET_SEEDS['discord-dark'], isNew: true }
const update = vi.fn()

describe('grupos do editor de tema', () => {
  it('preenchimento sólido: só a cor e os tipos; degradê: cores extras e direções', () => {
    const solid = renderToStaticMarkup(<FillField label="Destaque" field="accent" draft={DRAFT} update={update} />)
    expect(solid).toContain('aria-label="Destaque"')
    expect(solid).toContain('Degradê')
    expect(solid).not.toContain('Cor 2')
    const gradient = renderToStaticMarkup(
      <FillField
        label="Destaque"
        field="accent"
        draft={{ ...DRAFT, gradients: { accent: { type: 'linear', angle: 90, colors: ['#ff0000'] } } }}
        update={update}
      />
    )
    expect(gradient).toContain('aria-label="Cor 2"')
    expect(gradient).toContain('Destaque: direção do degradê')
    expect(gradient).not.toContain('Tirar a última cor')
  })

  it('radial não tem direção; com 2 cores dá para tirar uma e não acrescentar', () => {
    const html = renderToStaticMarkup(
      <FillField
        label="Fundo principal"
        field="background"
        draft={{ ...DRAFT, gradients: { background: { type: 'radial', angle: 0, colors: ['#000000', '#111111'] } } }}
        update={update}
      />
    )
    expect(html).not.toContain('direção do degradê')
    expect(html).toContain('Tirar a última cor')
    expect(html).not.toMatch(/>Cor<\/span>|>\s*Cor\s*</)
  })

  it('começar: ideias prontas (vermelho e branco), temas do app e gerar a partir de uma cor', () => {
    const html = renderToStaticMarkup(<StartGroup draft={DRAFT} update={update} />)
    expect(html).toContain('Vermelho e branco')
    expect(html).toContain('Ou de um tema do app…')
    expect(html).toContain('Gerar escuro')
  })

  it('cores extras no automático mostram a cor em uso', () => {
    const html = renderToStaticMarkup(<ColorsGroup draft={DRAFT} update={update} palette={buildPalette(DRAFT)} />)
    expect(html).toContain('Realce (links e seleção)')
    expect(html).toContain('value="#4d96ee"')
    expect(html.match(/Automático/g)?.length).toBe(3)
  })

  it('vidro desligado e brilho só no escuro', () => {
    expect(renderToStaticMarkup(<EffectsGroup draft={DRAFT} update={update} scheme="dark" />)).toContain('Desligado')
    expect(renderToStaticMarkup(<EffectsGroup draft={DRAFT} update={update} scheme="light" />)).toContain(
      'O brilho só aparece nos temas escuros.'
    )
  })

  it('forma: cantos padrão e retos', () => {
    expect(renderToStaticMarkup(<ShapeGroup draft={DRAFT} update={update} />)).toContain('Padrão')
    expect(renderToStaticMarkup(<ShapeGroup draft={{ ...DRAFT, radius: 0 }} update={update} />)).toContain('Retos')
    expect(renderToStaticMarkup(<ShapeGroup draft={{ ...DRAFT, radius: 150 }} update={update} />)).toContain('150%')
  })
})
