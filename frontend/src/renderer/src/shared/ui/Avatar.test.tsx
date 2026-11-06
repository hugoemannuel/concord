import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

// Na renderização de servidor o zustand devolveria o estado inicial: o store
// fica vazio e vale o que o Avatar recebe.
vi.mock('../../features/profile/store/profileStore', async (orig) => {
  const real = await orig<typeof import('../../features/profile/store/profileStore')>()
  return {
    ...real,
    useUserLook: (_id: string | undefined, fallback: Parameters<typeof real.lookOf>[1]) =>
      real.lookOf(undefined, fallback)
  }
})
vi.mock('../lib/config', () => ({ API_BASE_URL: 'http://host/api' }))
import Avatar from './Avatar'

const gif = '/api/profile-media/a_d'

describe('Avatar dos bots', () => {
  // O avatar do bot vem do servidor (avatar_url): o Avatar não conhece UUID de bot.
  it('bot sem foto cai na inicial, como qualquer pessoa', () => {
    const html = renderToStaticMarkup(
      <Avatar userId="4d414553-5452-4f00-8000-000000000001" name="Maestro" size={32} />
    )
    expect(html).not.toContain('<img')
    expect(html).toContain('>M</div>')
  })

  it('a foto tem o fundo neutro atrás (o GIF do Maestro é transparente)', () => {
    const html = renderToStaticMarkup(
      <Avatar name="Maestro" size={32} avatarUrl="/api/bot-media/a_maestro" />
    )
    expect(html).toContain('src="http://host/api/bot-media/a_maestro/static"')
    expect(html).toMatch(/<img[^>]*class="[^"]*bg-accent/)
  })
})

describe('Avatar com moldura', () => {
  it('sem moldura não desenha nada a mais', () => {
    const html = renderToStaticMarkup(<Avatar name="Mugis" size={32} />)
    expect(html).not.toContain('data-decoration')
  })

  it('a moldura fica por cima, 1,2× maior e centralizada', () => {
    const html = renderToStaticMarkup(
      <Avatar name="Mugis" size={32} decorationUrl="/api/profile-media/d" />
    )
    expect(html).toContain('data-decoration')
    expect(html).toContain('width:38px')
    expect(html).toContain('left:-3px')
    expect(html).toContain('pointer-events-none')
  })

  it('moldura GIF numa lista: só o quadro parado até o hover', () => {
    const html = renderToStaticMarkup(<Avatar name="Mugis" size={32} decorationUrl={gif} />)
    expect(html).toContain('/a_d/static')
    expect(html).not.toContain('/a_d"')
    expect(html).toMatch(/<img data-decoration[^>]*loading="lazy"/)
  })

  it('com a linha ativa (hover/foco) monta a moldura animada', () => {
    const html = renderToStaticMarkup(<Avatar name="Mugis" size={32} decorationUrl={gif} active />)
    expect(html).toContain('/a_d"')
  })

  it("animate='always' anima a moldura direto", () => {
    const html = renderToStaticMarkup(
      <Avatar name="Mugis" size={32} decorationUrl={gif} animate="always" />
    )
    expect(html).toContain('/a_d"')
    expect(html).not.toContain('/a_d/static')
  })

  it('indicador de fala (speaking) sem moldura fica em volta do avatar', () => {
    const html = renderToStaticMarkup(<Avatar name="Mugis" size={32} speaking />)
    expect(html).toContain('data-speaking-ring')
    expect(html).toContain('inset-0')
    expect(html).toContain('ring-2 ring-success')
  })

  it('indicador de fala (speaking) com moldura fica em volta da moldura para ela não tampar o círculo', () => {
    const html = renderToStaticMarkup(
      <Avatar name="Mugis" size={32} decorationUrl="/api/profile-media/d" speaking />
    )
    expect(html).toContain('data-speaking-ring')
    expect(html).toContain('width:38px')
    expect(html).toContain('left:-3px')
    expect(html).toContain('ring-2 ring-success')
  })

  it('reconhece ring-success passado por className e extrai para o anel da moldura', () => {
    const html = renderToStaticMarkup(
      <Avatar
        name="Mugis"
        size={96}
        decorationUrl="/api/profile-media/d"
        className="rounded-full ring-4 ring-success"
      />
    )
    expect(html).toContain('data-speaking-ring')
    expect(html).toContain('width:115px')
    expect(html).toContain('left:-10px')
    expect(html).toContain('ring-4 ring-success')
    expect(html).not.toMatch(/class="[^"]*ring-success[^"]*"[^>]*data-speaking-ring/)
  })
})
