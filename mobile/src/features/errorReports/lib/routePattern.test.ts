import { routePattern } from './routePattern'

describe('routePattern (segmentos do Expo Router → padrão da tela)', () => {
  it.each([
    [[], '/'],
    [['(app)'], '/'],
    [['(auth)', 'cadastro'], '/cadastro'],
    [['(app)', 'canal', '[channelId]'], '/canal/:channelId'],
    [['(app)', 'dm', '[conversationId]'], '/dm/:conversationId'],
    [['(app)', '(tabs)', 'configuracoes', '[secao]'], '/configuracoes/:secao'],
    [['(app)', 'docs', '[...rest]'], '/docs/*rest'],
    [['(app)', 'perfil', '550e8400-e29b-41d4-a716-446655440000'], '/perfil/:valor']
  ])('%j → %s', (segmentos, esperado) => {
    expect(routePattern(segmentos)).toBe(esperado)
  })
})
