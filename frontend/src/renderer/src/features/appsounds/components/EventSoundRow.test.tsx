import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.stubGlobal('window', {})

import AppSoundsSettings from './AppSoundsSettings'
import EventSoundRow, { type EventSoundRowProps } from './EventSoundRow'

const row = (over: Partial<EventSoundRowProps> = {}): string =>
  renderToStaticMarkup(
    <EventSoundRow
      event="mention"
      label="Menção"
      packId="salinha"
      choice="pack"
      hasCustom={false}
      busy={null}
      error={null}
      onChoice={vi.fn()}
      onPreview={vi.fn()}
      onUpload={vi.fn()}
      onRemove={vi.fn()}
      {...over}
    />
  )

describe('EventSoundRow', () => {
  it('sem ajuste: segue o pacote, dá para ouvir e enviar um áudio', () => {
    const html = row()
    expect(html).toContain('aria-label="Som: Menção"')
    expect(html).toContain('Do pacote (Padrão Salinha)')
    expect(html).toMatch(/aria-label="Ouvir: Menção"[^>]*><svg/)
    expect(html).toContain('Enviar áudio')
    expect(html).not.toContain('Meu áudio')
    expect(html).not.toContain('role="alert"')
  })

  it('com áudio próprio: "Meu áudio", trocar, remover e o erro do evento', () => {
    const html = row({ choice: 'custom', hasCustom: true, busy: 'remove', error: 'O som pode ter até 1 MB.' })
    expect(html).toContain('Meu áudio')
    expect(html).toContain('Trocar áudio')
    expect(html).toMatch(/aria-label="Remover meu áudio: Menção"[^>]*disabled=""/)
    expect(html).toContain('role="alert"')
    expect(html).toContain('aria-describedby="sound-error-mention"')
  })

  it('"Sem som": o botão de ouvir fica desligado', () => {
    expect(row({ choice: 'off' })).toMatch(/aria-label="Ouvir: Menção"[^>]*disabled=""/)
    expect(row()).not.toMatch(/aria-label="Ouvir: Menção"[^>]*disabled=""/)
  })
})

describe('AppSoundsSettings', () => {
  it('mostra os pacotes, o volume e os eventos por grupo', () => {
    const html = renderToStaticMarkup(<AppSoundsSettings />)
    expect(html).toContain('Pacote de sons')
    expect(html).toContain('Fliperama')
    expect(html).toContain('Volume dos sons')
    expect(html).toContain('Chamada recebida')
    expect(html).toMatch(/aria-label="Ouvir o pacote Cristal"[^>]*><svg/)
  })
})
