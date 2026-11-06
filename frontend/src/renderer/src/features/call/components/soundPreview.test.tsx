import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { soundPreview } from './soundPreview'

const sound = (over: Record<string, unknown> = {}) =>
  ({
    id: 's1',
    server_id: 'srv-b',
    uploader_id: 'u',
    uploader_name: 'Ana',
    name: 'Buzina',
    content_type: 'audio/wav',
    size_bytes: 1,
    duration_ms: 1000,
    created_at: '',
    ...over
  }) as Parameters<typeof soundPreview>[0]

const html = (node: React.ReactNode): string => renderToStaticMarkup(<>{node}</>)

describe('prévia de um som no rodapé da mesa', () => {
  it('nome, de qual servidor e o ícone dele', () => {
    const p = soundPreview(sound({ emoji: '🎺' }), { id: 'srv-b', name: 'Servidor B' })
    expect(p).toMatchObject({ title: 'Buzina', detail: 'de Servidor B' })
    expect(html(p?.media)).toBe('🎺')
    expect(html(p?.aside)).toContain('S')
  })

  it('sem emoji usa o ícone da mesa; sem o servidor na lista, o nome que veio no favorito', () => {
    const p = soundPreview(sound({ server_name: 'Favorito de fora' }), undefined)
    expect(p?.detail).toBe('de Favorito de fora')
    expect(html(p?.media)).toContain('<svg')
    expect(p?.aside).toBeFalsy()
  })

  it('som desconhecido não tem prévia', () => {
    expect(soundPreview(undefined, undefined)).toBeNull()
  })
})
