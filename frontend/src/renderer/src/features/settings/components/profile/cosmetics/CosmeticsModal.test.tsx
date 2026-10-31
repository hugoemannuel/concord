import { describe, expect, it, vi } from 'vitest'

vi.mock('../../../../../shared/ui/Modal', () => ({
  default: ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div role="dialog" data-title={title}>
      {children}
    </div>
  )
}))
vi.mock('../../../../../shared/ui/Avatar', () => ({
  default: (p: { decorationUrl?: string | null; animate?: string }) => (
    <u data-avatar data-decoration={p.decorationUrl ?? ''} data-animate={p.animate} />
  )
}))
vi.mock('../../../../profile/components/Nameplate', () => ({
  default: (p: { url?: string | null; forceAnimate?: boolean }) =>
    p.url ? <i data-nameplate={p.url} data-force={String(Boolean(p.forceAnimate))} /> : null
}))
vi.mock('../../../../profile/components/StyledName', () => ({
  default: ({ name }: { name: string }) => <b>{name}</b>
}))

import { renderToStaticMarkup } from 'react-dom/server'
import type { User } from '../../../../auth/store/authStore'
import CosmeticsModal from './CosmeticsModal'

const noop = (): void => {}
const base = { id: 'u1', username: 'ana', display_name: 'Ana', email: 'a@x' } as User

function render(user: Partial<User>): string {
  return renderToStaticMarkup(
    <CosmeticsModal
      user={{ ...base, ...user }}
      busy={false}
      onChoose={noop}
      onPickDecoration={noop}
      onRemove={noop}
      onClose={noop}
    />
  )
}

describe('CosmeticsModal', () => {
  it('título e as três opções da faixa, marcando a atual', () => {
    const html = render({ nameplate_mode: 'banner' })
    expect(html).toContain('data-title="Faixa e moldura"')
    expect(html).toContain('role="radiogroup"')
    for (const label of ['Desligada', 'Usar o banner', 'Imagem própria'])
      expect(html).toContain(label)
    expect(html).toMatch(/aria-checked="true"[^>]*>[\s\S]*?Usar o banner/)
    expect((html.match(/aria-checked="true"/g) ?? []).length).toBe(1)
  })

  it('só a opção marcada entra no Tab (as outras pelas setas)', () => {
    const html = render({ nameplate_mode: 'off' })
    expect((html.match(/tabindex="0"/g) ?? []).length).toBe(1)
  })

  it('"Remover faixa" e "Remover moldura" só quando existem', () => {
    expect(render({})).not.toContain('Remover faixa')
    expect(render({})).not.toContain('Remover moldura')
    const html = render({
      nameplate_custom_url: '/api/profile-media/n',
      avatar_decoration_url: '/api/profile-media/d'
    })
    expect(html).toContain('Remover faixa')
    expect(html).toContain('Remover moldura')
    expect(html).toContain('Alterar moldura')
  })

  it('prévia com GIF: Parada e Animando, a segunda forçando a animação', () => {
    const html = render({
      nameplate_url: '/api/profile-media/a_n',
      avatar_decoration_url: '/api/profile-media/d'
    })
    expect(html).toContain('Parada')
    expect(html).toContain('Animando')
    expect(html).toContain('data-force="true"')
    expect(html).toContain('data-animate="always"')
  })

  it('prévia sem GIF: só Parada', () => {
    const html = render({ nameplate_url: '/api/profile-media/n' })
    expect(html).toContain('Parada')
    expect(html).not.toContain('Animando')
  })
})
