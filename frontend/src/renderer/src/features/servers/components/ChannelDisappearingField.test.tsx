import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import ChannelDisappearingField from './ChannelDisappearingField'

describe('ChannelDisappearingField', () => {
  it('mostra o seletor com rótulo, opções (0 = Desativadas), valor atual e ajuda', () => {
    const html = renderToStaticMarkup(<ChannelDisappearingField value={604800} onChange={() => {}} />)
    expect(html).toContain('for="channel-disappearing"')
    expect(html).toContain('>Mensagens temporárias<')
    expect(html).toContain('<option value="0" class="bg-floating">Desativadas</option>')
    expect(html).toContain('<option value="604800" class="bg-floating" selected="">7 dias</option>')
    expect(html).toContain('<option value="7776000" class="bg-floating">90 dias</option>')
    expect(html).toContain(
      'As novas mensagens do canal somem depois do prazo. As que já foram enviadas não mudam.'
    )
    expect(html).toContain('aria-describedby="channel-disappearing-help"')
  })
})
