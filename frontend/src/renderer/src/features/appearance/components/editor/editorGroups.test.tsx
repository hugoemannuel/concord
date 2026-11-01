import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { buildPalette } from '../../lib/palette'
import { PRESET_SEEDS } from '../../lib/presetSeeds'
import type { Draft } from '../../store/themeEditorStore'
import { ColorsGroup } from './ColorsGroup'
import { EffectsGroup } from './EffectsGroup'
import { FillField } from './FillField'
import { BackdropGroup } from './BackdropGroup'
import { ImageGroup } from './ImageGroup'
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
    expect(html).toContain('Branco e vermelho')
    expect(html).toContain('Ou de um tema do app…')
    expect(html).toContain('Gerar escuro')
  })

  it('cores extras no automático mostram a cor em uso', () => {
    const html = renderToStaticMarkup(<ColorsGroup draft={DRAFT} update={update} palette={buildPalette(DRAFT)} />)
    expect(html).toContain('Realce (links e seleção)')
    expect(html).toContain('value="#4d96ee"')
    expect(html.match(/Automático/g)?.length).toBe(3)
  })

  it('todas as seções abrem recolhidas, até num tema novo', () => {
    const groups = [
      <StartGroup key="s" draft={DRAFT} update={update} />,
      <ColorsGroup key="c" draft={DRAFT} update={update} palette={buildPalette(DRAFT)} />,
      <EffectsGroup key="e" draft={DRAFT} update={update} scheme="dark" />,
      <BackdropGroup key="b" draft={DRAFT} update={update} />,
      <ImageGroup key="i" draft={DRAFT} update={update} scheme="dark" />,
      <ShapeGroup key="f" draft={DRAFT} update={update} />
    ]
    for (const group of groups) {
      const html = renderToStaticMarkup(group)
      expect(html).toContain('aria-expanded="false"')
      expect(html).toMatch(/<div id="[^"]+" hidden=""/)
    }
  })

  it('vidro desligado; o brilho explica o que faz e que só funciona no escuro', () => {
    const dark = renderToStaticMarkup(<EffectsGroup draft={DRAFT} update={update} scheme="dark" />)
    expect(dark).toContain('Desligado')
    expect(dark).toContain('Manchas de luz coloridas')
    expect(renderToStaticMarkup(<EffectsGroup draft={DRAFT} update={update} scheme="light" />)).toContain(
      'Só funciona com fundo escuro'
    )
    const withFx = renderToStaticMarkup(<EffectsGroup draft={{ ...DRAFT, effect: 'snow' }} update={update} scheme="dark" />)
    expect(withFx).toContain('o embaçado fica desligado')
  })

  it('efeitos: os mesmos do cartão de perfil; com efeito, quantidade, velocidade e cor', () => {
    const none = renderToStaticMarkup(<BackdropGroup draft={DRAFT} update={update} />)
    for (const label of ['Nenhum', 'Partículas', 'Neve', 'Fogo', 'Matrix', 'Synthwave', 'Chuva']) expect(none).toContain(label)
    expect(none).not.toContain('Quantidade')
    const snow = renderToStaticMarkup(<BackdropGroup draft={{ ...DRAFT, effect: 'snow' }} update={update} />)
    expect(snow).toContain('Quantidade')
    expect(snow).toContain('Cor do efeito')
  })

  it('imagem de fundo: escolher; com imagem, prévia, véu (nunca abaixo do mínimo) e desfoque', () => {
    expect(renderToStaticMarkup(<ImageGroup draft={DRAFT} update={update} scheme="dark" />)).toContain('Escolher imagem')
    const image = '/api/app-theme-images/0f8fad5b-d9cb-469f-a165-70867728950e'
    const html = renderToStaticMarkup(
      <ImageGroup draft={{ ...DRAFT, image, imageDim: 0 }} update={update} scheme="light" />
    )
    expect(html).toContain('Trocar imagem')
    expect(html).toMatch(new RegExp(`src="[^"]*${image}"`))
    expect(html).toContain('Clarear')
    expect(html).toContain('35%')
    expect(html).toContain('Desfocar')
  })

  it('fontes: mais de dez, cada uma escrita nela mesma', () => {
    const html = renderToStaticMarkup(<ShapeGroup draft={DRAFT} update={update} />)
    expect(html.match(/aria-pressed=/g)?.length).toBeGreaterThanOrEqual(3 + 10)
    expect(html).toContain('font-family:&#x27;Montserrat&#x27;')
    expect(html).toContain('>Zilla Slab<')
  })

  it('forma: cantos padrão e retos', () => {
    expect(renderToStaticMarkup(<ShapeGroup draft={DRAFT} update={update} />)).toContain('Padrão')
    expect(renderToStaticMarkup(<ShapeGroup draft={{ ...DRAFT, radius: 0 }} update={update} />)).toContain('Retos')
    expect(renderToStaticMarkup(<ShapeGroup draft={{ ...DRAFT, radius: 150 }} update={update} />)).toContain('150%')
  })
})
