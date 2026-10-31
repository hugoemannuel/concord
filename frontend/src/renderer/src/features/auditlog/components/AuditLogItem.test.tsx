import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { AuditEntry } from '../api/auditLog'
import AuditLogItem, { AuditEntryDetails } from './AuditLogItem'

const entry = (over: Partial<AuditEntry>): AuditEntry => ({
  id: 1,
  action: 'member.kick',
  created_at: '2026-10-30T12:00:00Z',
  actor_id: 'a1',
  actor_name: 'Fulano',
  actor_avatar_url: null,
  target_type: 'member',
  target_id: 'b2',
  target_name: 'Ciclano',
  channel_id: '',
  channel_name: '',
  changes: [],
  reason: '',
  ...over
})

describe('AuditLogItem', () => {
  it('sem detalhes: só a frase e a hora, sem botão', () => {
    const html = renderToStaticMarkup(<AuditLogItem entry={entry({})} />)
    expect(html).toContain('<b class="font-semibold text-strong">@Fulano</b>')
    expect(html).toContain(' expulsou ')
    expect(html).toContain('dateTime="2026-10-30T12:00:00Z"')
    expect(html).not.toContain('<button')
  })

  it('com mudanças: botão que abre os detalhes, fechado de início', () => {
    const html = renderToStaticMarkup(
      <AuditLogItem entry={entry({ action: 'member.ban', reason: 'spam' })} />
    )
    expect(html).toContain('aria-expanded="false"')
    expect(html).toContain('Ver detalhes')
    expect(html).not.toContain('spam')
  })

  it('os detalhes mostram antes, depois e as permissões liberadas e tiradas', () => {
    const html = renderToStaticMarkup(
      <AuditEntryDetails
        id="d1"
        rows={[
          { label: 'Nome', before: 'VIP', after: 'Super VIP' },
          { label: 'Tipo', after: 'Voz' },
          { label: 'Permissões', added: ['Banir membros'], removed: [] },
          { label: 'Negado', added: [], removed: ['Ver canais'] }
        ]}
      />
    )
    expect(html).toContain('line-through">VIP</span>')
    expect(html).toContain('Super VIP')
    expect(html).toContain('Voz')
    expect(html).toContain('Liberou: Banir membros')
    expect(html).toContain('Tirou: Ver canais')
  })
})
