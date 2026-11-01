import { PRIVACY_URL, TERMS_URL } from './legalLinks'

describe('legalLinks', () => {
  it('aponta para as páginas do site, por HTTPS', () => {
    expect(PRIVACY_URL).toBe('https://salinha.bhrx.com.br/privacidade.html')
    expect(TERMS_URL).toBe('https://salinha.bhrx.com.br/termos.html')
  })
})
