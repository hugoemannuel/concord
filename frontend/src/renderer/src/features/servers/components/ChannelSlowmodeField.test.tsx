import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import ChannelSlowmodeField from './ChannelSlowmodeField'

describe('ChannelSlowmodeField', () => {
  it('mostra o seletor com rótulo, o valor atual e a explicação', () => {
    const html = renderToStaticMarkup(<ChannelSlowmodeField value={30} onChange={() => {}} />)
    expect(html).toContain('for="channel-slowmode"')
    expect(html).toContain('>Modo lento<')
    expect(html).toContain('<option value="0" class="bg-floating">Desligado</option>')
    expect(html).toContain('<option value="30" class="bg-floating" selected="">30 s</option>')
    expect(html).toContain('<option value="21600" class="bg-floating">6 h</option>')
    expect(html).toContain('Quem tem Gerenciar mensagens ou')
    expect(html).toContain('aria-describedby="channel-slowmode-help"')
  })
})
