import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import RsvpButtons, { nextRsvp } from './RsvpButtons'

describe('RsvpButtons', () => {
  it('sem resposta, nenhum botão está marcado', () => {
    const html = renderToStaticMarkup(<RsvpButtons value={null} onChange={() => {}} />)
    expect(html.match(/aria-pressed="false"/g)).toHaveLength(2)
    expect(html).toContain('Vou')
    expect(html).toContain('Não vou')
  })

  it('marca só o botão da resposta dada', () => {
    const yes = renderToStaticMarkup(<RsvpButtons value={true} onChange={() => {}} />)
    expect(yes).toMatch(/aria-pressed="true"[^>]*>(?:(?!<button)[\s\S])*Vou/)
    expect(yes.match(/aria-pressed="true"/g)).toHaveLength(1)
    const no = renderToStaticMarkup(<RsvpButtons value={false} onChange={() => {}} />)
    expect(no.match(/aria-pressed="true"/g)).toHaveLength(1)
  })

  it('travado enquanto envia', () => {
    const html = renderToStaticMarkup(<RsvpButtons value={null} onChange={() => {}} disabled />)
    expect(html.match(/disabled/g)?.length).toBeGreaterThanOrEqual(2)
  })

  it('clicar de novo na resposta atual tira a resposta', () => {
    expect(nextRsvp(null, true)).toBe(true)
    expect(nextRsvp(true, true)).toBeNull()
    expect(nextRsvp(true, false)).toBe(false)
    expect(nextRsvp(false, false)).toBeNull()
  })
})
