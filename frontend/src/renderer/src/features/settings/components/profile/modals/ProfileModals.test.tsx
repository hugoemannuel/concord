import { describe, expect, it, vi } from 'vitest'

// Sem DOM: o Modal vira uma caixa com o título; o cartão, só o que ele recebe.
vi.mock('../../../../../shared/ui/Modal', () => ({
  default: ({ title, children, xl }: { title: string; children: React.ReactNode; xl?: boolean }) => (
    <div role="dialog" data-title={title} data-xl={String(Boolean(xl))}>
      {children}
    </div>
  )
}))
vi.mock('../../../../profile/components/ProfileCardBody', () => ({
  default: ({ profile }: { profile: { display_name: string; pronouns: string } }) => (
    <div data-card={profile.display_name} data-pronouns={profile.pronouns} />
  )
}))
vi.mock('../../../../../shared/ui/Avatar', () => ({ default: () => <span data-avatar /> }))
vi.mock('../../../../profile/components/EntranceSoundSettings', () => ({
  default: () => <i>som</i>
}))
vi.mock('../cosmetics/CosmeticsEditor', () => ({ default: () => <i data-cosmetics /> }))
vi.mock('../../../../profile/store/meActions', () => ({
  changeMyStatus: vi.fn()
}))

import { renderToStaticMarkup } from 'react-dom/server'
import { draftFromProfile } from '../../../../profile/lib/profileValidation'
import EditModalShell from './EditModalShell'
import FieldModal from './FieldModal'
import NameStyleModal from './NameStyleModal'
import ProfileEditModal from './ProfileEditModal'
import { SPOT_FIELDS } from './spotFields'

const user = { id: 'u1', username: 'ana', email: 'a@x', display_name: 'Ana', pronouns: 'ela/dela' } as never
const base = { user, avatarUrl: null, bannerUrl: null }
const draft = draftFromProfile({ display_name: 'Ana', pronouns: 'ela/dela' })
const noop = (): void => {}

describe('EditModalShell', () => {
  it('controles, prévia e os botões; a ação extra fica à esquerda', () => {
    const html = renderToStaticMarkup(
      <EditModalShell
        title="T"
        onClose={noop}
        onApply={noop}
        canApply
        extraAction={<i>extra</i>}
        preview={<i>prévia</i>}
      >
        <i>campos</i>
      </EditModalShell>
    )
    expect(html).toContain('data-title="T"')
    expect(html).toContain('<i>campos</i>')
    expect(html).toContain('aria-label="Prévia"')
    expect(html).toContain('<i>extra</i>')
    expect(html).toContain('Cancelar')
    expect(html).toContain('>Aplicar<')
  })
  it('salvando: "Salvando…" e botões travados', () => {
    const html = renderToStaticMarkup(
      <EditModalShell title="T" onClose={noop} onApply={noop} canApply busy preview={null}>
        x
      </EditModalShell>
    )
    expect(html).toContain('Salvando…')
    expect(html.match(/disabled=""/g)?.length).toBe(2)
  })
})

describe('NameStyleModal', () => {
  it('nome, estilo, Surpreenda-me e as duas prévias (cartão e chat)', () => {
    const html = renderToStaticMarkup(
      <NameStyleModal base={base} draft={draft} onClose={noop} onApply={noop} />
    )
    expect(html).toContain('data-title="Nome de exibição"')
    expect(html).toContain('data-xl="true"')
    expect(html).toContain('aria-label="Nome de exibição"')
    expect(html).toContain('Fonte')
    expect(html).toContain('Efeito')
    expect(html).toContain('Surpreenda-me')
    // O dado é ícone do conjunto, não emoji.
    expect(html).not.toContain('🎲')
    expect(html).toMatch(/<svg[^>]*>[\s\S]*<\/svg>Surpreenda-me/)
    expect(html).toContain('data-card="Ana"')
    expect(html).toContain('No chat')
  })
  it('nome inválido trava o Aplicar', () => {
    const html = renderToStaticMarkup(
      <NameStyleModal
        base={base}
        draft={{ ...draft, display_name: ' ' }}
        onClose={noop}
        onApply={noop}
      />
    )
    expect(html).toMatch(/type="submit" disabled=""/)
    // A prévia usa o @ enquanto não há nome.
    expect(html).toContain('data-card="ana"')
  })
})

describe('FieldModal', () => {
  it('pronomes: o campo e o cartão ao vivo', () => {
    const html = renderToStaticMarkup(
      <FieldModal field={SPOT_FIELDS.pronouns} base={base} draft={draft} onClose={noop} onApply={noop} />
    )
    expect(html).toContain('data-title="Pronomes"')
    expect(html).toContain('value="ela/dela"')
    expect(html).toContain('data-pronouns="ela/dela"')
  })
  it('cada parte tem o campo dela', () => {
    const fields = { note: 'Nota', bio: 'Sobre mim', links: 'Links' } as const
    for (const [spot, title] of Object.entries(fields)) {
      const html = renderToStaticMarkup(
        <FieldModal
          field={SPOT_FIELDS[spot as keyof typeof fields]}
          base={base}
          draft={draft}
          onClose={noop}
          onApply={noop}
        />
      )
      expect(html).toContain(`data-title="${title}"`)
    }
  })
  it('valor inválido trava o Aplicar', () => {
    const html = renderToStaticMarkup(
      <FieldModal
        field={SPOT_FIELDS.pronouns}
        base={base}
        draft={{ ...draft, pronouns: 'x'.repeat(50) }}
        onClose={noop}
        onApply={noop}
      />
    )
    expect(html).toMatch(/type="submit" disabled=""/)
  })
})

describe('ProfileEditModal', () => {
  const render = (modal: Parameters<typeof ProfileEditModal>[0]['modal'], busy = false): string =>
    renderToStaticMarkup(
      <ProfileEditModal modal={modal} base={base} busy={busy} onClose={noop} onApply={async () => true} />
    )

  it('nada aberto: sem modal', () => {
    expect(render(null)).toBe('')
  })
  it('o nome abre o modal do nome; cada bloco, o campo dele', () => {
    expect(render('name')).toContain('Surpreenda-me')
    expect(render('bio')).toContain('data-title="Sobre mim"')
    expect(render('banner_color')).toContain('data-title="Cor do banner"')
    expect(render('sound')).toContain('data-title="Som de entrada"')
    expect(render('status')).toContain('data-title="Status"')
  })
  it('faixa e moldura abre o editor deles', () => {
    expect(render('cosmetics')).toContain('data-cosmetics')
  })
  it('o tema abre largo, com as predefinições', () => {
    const html = render('theme')
    expect(html).toContain('data-title="Tema do perfil"')
    expect(html).toContain('data-xl="true"')
    expect(html).toContain('Predefinições')
  })
  it('salvando: o Aplicar mostra "Salvando…" e trava', () => {
    const html = render('pronouns', true)
    expect(html).toContain('Salvando…')
    expect(html).toMatch(/type="submit" disabled=""/)
  })
  it('o campo começa com o que está salvo', () => {
    expect(render('pronouns')).toContain('value="ela/dela"')
  })
})
