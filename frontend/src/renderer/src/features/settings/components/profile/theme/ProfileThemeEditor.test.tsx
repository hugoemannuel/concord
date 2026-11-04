import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { DEFAULT_PROFILE_THEME, type ProfileTheme } from '../../../../profile/lib/profileTheme'
import { PROFILE_PRESETS } from '../../../../profile/lib/profilePresets'
import ProfileThemeEditor from './ProfileThemeEditor'

/** Setas, símbolos e emoji que eram usados como ícone (agora só SVG). */
const GLYPH = /[\u2190-\u21ff\u2500-\u27bf\u3030\u{1f300}-\u{1faff}]|>01</u

const render = (theme: Partial<ProfileTheme>): string =>
  renderToStaticMarkup(
    <ProfileThemeEditor value={{ ...DEFAULT_PROFILE_THEME, ...theme }} onChange={() => {}} />
  )

describe('ProfileThemeEditor', () => {
  it('padrão: seções e predefinições, sem opções de borda nem de efeito', () => {
    const html = render({})
    for (const t of ['Predefinições', 'Borda', 'Fundo do perfil', 'Efeito', 'Textura']) {
      expect(html).toContain(t)
    }
    for (const p of PROFILE_PRESETS) expect(html).toContain(p.label)
    expect(html).not.toContain('Espessura')
    expect(html).not.toContain('Quantidade')
    expect(html).not.toContain('Direção do degradê')
    // "Padrão" é a predefinição escolhida.
    expect(html).toMatch(/aria-pressed="true" title="Padrão"/)
  })

  it('borda e fundo em degradê: cores, espessura, animação e direção', () => {
    const html = render({
      border: 'gradient',
      border_colors: ['#111111', '#222222'],
      background: 'gradient',
      background_colors: ['#333333', '#444444']
    })
    expect(html).toContain('Cor inicial')
    expect(html).toContain('Cor final')
    expect(html).toContain('Espessura')
    expect(html).toContain('2 px')
    expect(html).toContain('Girar')
    expect(html).toContain('Direção do degradê')
    expect(html).toContain('aria-label="Para baixo"')
    expect(html).toContain('O texto fica claro ou escuro sozinho')
  })

  it('efeito com cor: quantidade, velocidade e a cor', () => {
    const html = render({ effect: 'fire', effect_color: '#00ff00' })
    expect(html).toContain('Quantidade')
    expect(html).toContain('Velocidade')
    expect(html).toContain('Média')
    expect(html).toContain('Cor do efeito')
    expect(html).toContain('value="#00ff00"')
    expect(html).toContain('Usar a cor original')
  })

  it('efeito sem cor própria (confete): sem a cor', () => {
    const html = render({ effect: 'confetti' })
    expect(html).toContain('Quantidade')
    expect(html).not.toContain('Cor do efeito')
    expect(html).not.toContain('Usar a cor original')
  })

  it('os efeitos aparecem por grupo', () => {
    const html = render({})
    for (const g of ['Básicos', 'Natureza', 'Clima', 'Espaço', 'Festa', 'Retrô']) {
      expect(html).toContain(`aria-label="${g}"`)
    }
    for (const e of ['Vaga-lumes', 'Sakura', 'Estrelas cadentes', 'Bandeirinhas', 'Fogos']) {
      expect(html).toContain(e)
    }
  })

  it('sem efeito: nada de "Mais opções"', () => {
    expect(render({})).not.toContain('Mais opções')
  })

  it('"Mais opções" começa recolhido e tem o que o efeito expõe', () => {
    const html = render({ effect: 'rain' })
    expect(html).toMatch(/aria-expanded="false"[^>]*>Mais opções/)
    for (const t of ['Tamanho', 'Opacidade', 'Brilho', 'Direção', 'Onde aparece', 'Só o banner']) {
      expect(html).toContain(t)
    }
    expect(html).toContain('Mistura de cor')
    expect(html).toContain('aria-label="Para a esquerda"')
  })

  it('efeito sem direção nem tamanho (glitch): só opacidade e área', () => {
    const html = render({ effect: 'glitch' })
    expect(html).toContain('Opacidade')
    expect(html).toContain('Onde aparece')
    for (const t of ['Tamanho', 'Direção do efeito', 'Mistura de cor', '>Brilho<']) {
      expect(html).not.toContain(t)
    }
  })

  it('duas cores: a segunda amostra; arco-íris: sem amostra, com o caminho de volta', () => {
    const duo = render({ effect: 'rain', effect_palette: 'duo' })
    expect(duo).toContain('Segunda cor')
    expect(duo).toContain('Usar a cor original')
    const rainbow = render({ effect: 'rain', effect_palette: 'rainbow' })
    expect(rainbow).not.toContain('Cor do efeito')
    expect(rainbow).not.toContain('Segunda cor')
    expect(rainbow).toContain('Usar a cor original')
  })

  it('direção do degradê: a mesma seta girada pelo ângulo, sem setas de texto', () => {
    const html = render({ background: 'gradient', background_colors: ['#333333', '#444444'] })
    const group = html.match(/aria-label="Direção do degradê">([\s\S]*?)<\/div>/)![1]
    expect(group.match(/<svg/g)).toHaveLength(8)
    for (const angle of [360, 45, 90, 135, 180, 225, 270, 315]) {
      expect(group).toContain(`rotate:${angle}deg`)
    }
    expect(group).not.toMatch(GLYPH)
  })

  it('efeitos e predefinições com ícones do conjunto, sem emoji nem símbolos', () => {
    const html = render({ effect: 'fire' })
    const effects = html.match(/aria-label="Efeito">([\s\S]*?)<\/div>/)![1]
    expect(effects.match(/<button/g)!.length).toBe(effects.match(/<svg/g)!.length)
    expect(html).not.toMatch(GLYPH)
    expect(html).not.toMatch(/[✦•—▚▦☂❄♥]/)
  })
})
