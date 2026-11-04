import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import ProfileCardFrame from './ProfileCardFrame'
import { DEFAULT_PROFILE_THEME, profileThemeLook, type ProfileTheme } from '../lib/profileTheme'

const render = (effect: string, withProp = true): string => {
  const theme = { ...DEFAULT_PROFILE_THEME, effect, effect_density: 100 }
  return renderToStaticMarkup(
    <ProfileCardFrame look={profileThemeLook(theme)} effect={withProp ? effect : undefined}>
      <p>corpo</p>
    </ProfileCardFrame>
  )
}

describe('ProfileCardFrame', () => {
  it('efeito em CSS: partículas (mais com quantidade alta)', () => {
    const html = render('sparkles')
    expect(html).toContain('pt-fx-sparkles')
    expect(html).toContain('✦')
    expect(html.match(/<span/g)?.length).toBeGreaterThan(10)
    expect(render('snow')).toContain('top:-8px')
  })
  it('efeito em canvas: um <canvas> decorativo', () => {
    const html = render('fire')
    expect(html).toContain('<canvas')
    expect(html).toContain('aria-hidden="true"')
  })
  it('sem efeito, ou sem pedir o efeito: só o corpo', () => {
    expect(render('none')).not.toContain('class="pt-fx')
    expect(render('fire', false)).not.toContain('canvas')
    expect(render('none')).toContain('corpo')
  })
  describe('ajustes do efeito', () => {
    const tuned = (over: Partial<ProfileTheme>): string => {
      const theme = { ...DEFAULT_PROFILE_THEME, ...over }
      return renderToStaticMarkup(
        <ProfileCardFrame look={profileThemeLook(theme)} effect={theme.effect}>
          <p>corpo</p>
        </ProfileCardFrame>
      )
    }
    it('padrão: sem classe nem estilo a mais (tema salvo desenha igual)', () => {
      expect(tuned({ effect: 'fire' })).toContain('<canvas aria-hidden="true" class="pt-fx"></canvas>')
      expect(tuned({ effect: 'snow' })).toContain('class="pt-fx pt-fx-snow">')
    })
    it('só o banner e opacidade, em canvas e em CSS', () => {
      const canvas = tuned({ effect: 'fire', effect_area: 'banner', effect_opacity: 40 })
      expect(canvas).toContain('class="pt-fx pt-area-banner"')
      expect(canvas).toContain('opacity:0.4')
      const css = tuned({ effect: 'snow', effect_area: 'banner', effect_opacity: 40 })
      expect(css).toContain('pt-fx-snow pt-area-banner')
      expect(css).toContain('opacity:0.4')
    })
    it('partículas em CSS: cor por partícula na mistura e raio do brilho', () => {
      const html = tuned({ effect: 'particles', effect_palette: 'rainbow', effect_glow: 50 })
      expect(html).toContain('--pt-fxc:hsl(')
      expect(html).toContain('--pt-fxg:9px')
    })
    it('efeito novo: um <canvas>', () => {
      expect(tuned({ effect: 'fireflies' })).toContain('<canvas')
    })
  })
})
