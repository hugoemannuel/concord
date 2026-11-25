import { byteLength, MAX_MESSAGE_BYTES, MAX_STACK_BYTES, MAX_STACK_LINES, scrubMessage, scrubStack, scrubText } from './errorScrub'

const JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U'

describe('scrubText (regras 1–5 do ADR 0068)', () => {
  it.each([
    ['URL com ?token= perde a query', 'falhou em https://x.com/api/a?token=abc123#frag agora', 'falhou em https://x.com/api/a agora'],
    ['URL com só fragmento perde o fragmento', 'abriu https://x.com/a#segredo', 'abriu https://x.com/a'],
    ['Bearer qualquer vira marcador', 'Authorization: Bearer abc.def', 'Authorization: Bearer <token>'],
    ['JWT solto vira marcador', `token ${JWT} inválido`, 'token <token> inválido'],
    ['hex longo vira marcador', 'chave 0123456789abcdef0123456789abcdef0 fim', 'chave <token> fim'],
    ['base64url longo com letras e números vira marcador', 'k=Ab3_dE5-fG7hI9jK1lM3nO5pQ7rS9tU1 fim', 'k=<token> fim'],
    ['nome longo só de letras (função) fica', 'at useCallPresenceSynchronizationEffect', 'at useCallPresenceSynchronizationEffect'],
    ['e-mail vira marcador', 'conta ana.silva+x@exemplo.com.br não existe', 'conta <email> não existe'],
    ['UUID vira marcador', 'canal 550e8400-e29b-41d4-a716-446655440000 sumiu', 'canal <id> sumiu'],
    ['caminho do app no Android fica', 'em /data/user/0/com.salinha.app/files/x.js', 'em /data/user/0/com.salinha.app/files/x.js'],
    ['/home/<nome> some', 'em /home/joao/app/x.js', 'em /home/<user>/app/x.js'],
    ['/Users/<nome> some', 'em /Users/maria/app/x.js', 'em /Users/<user>/app/x.js'],
    ['C:\\Users\\<nome> some', 'em C:\\Users\\Joao\\AppData\\x.js', 'em C:\\Users\\<user>\\AppData\\x.js'],
    ['C:/Users/<nome> some (file:///)', 'em file:///C:/Users/Joao/app/x.js', 'em file:///C:/Users/<user>/app/x.js'],
    ['aspas longas viram reticências', 'texto "isto aqui é uma mensagem que a pessoa digitou" quebrou', 'texto "…" quebrou'],
    ['aspas simples longas também', "texto 'isto aqui é uma mensagem que a pessoa digitou' quebrou", 'texto "…" quebrou'],
    ['crase longa também', 'texto `isto aqui é uma mensagem que a pessoa digitou` quebrou', 'texto "…" quebrou'],
    ['aspas curtas ficam', "Cannot read property 'id' of undefined", "Cannot read property 'id' of undefined"],
    // Mesmos casos da tabela do servidor (backend/internal/apperrors/scrub_test.go) e do desktop.
    ['bearer minúsculo', 'bearer abc', 'Bearer <token>'],
    ['bearer maiúsculo', 'BEARER abc', 'Bearer <token>'],
    ['Windows minúsculo', 'c:\\users\\ana\\x', 'c:\\users\\<user>\\x'],
    ['Windows com barras escapadas', 'C:\\\\Users\\\\Ana Silva\\\\x', 'C:\\\\Users\\\\<user>\\\\x'],
    ['Windows com espaço no nome', 'C:\\Users\\Ana Maria\\AppData\\x.log', 'C:\\Users\\<user>\\AppData\\x.log'],
    ['esquema do app perde a query', 'salinha://x?y=1', 'salinha://x'],
    ['URL relativa perde a query', 'GET /api/media/x?token=abc', 'GET /api/media/x'],
    ['URL relativa no quadro mantém linha e coluna', 'at f (/a/b.js?v=1:3:4)', 'at f (/a/b.js:3:4)'],
    ['interrogação de texto fica', 'o que é /isto? nada', 'o que é /isto? nada'],
    ['caminho sem query fica', 'at f (/data/app/x.js:1:2)', 'at f (/data/app/x.js:1:2)'],
    ['quadro do Hermes não é e-mail', 'render@index.android.bundle:1:234', 'render@index.android.bundle:1:234'],
    ['hex só de dígitos de 32+', `n ${'1'.repeat(40)}`, 'n <token>']
  ])('%s', (_nome, entrada, esperado) => {
    expect(scrubText(entrada)).toBe(esperado)
  })
})

describe('scrubMessage (regra 6)', () => {
  it('multilinha: fica só a primeira linha', () => {
    expect(scrubMessage('Invariant Violation: x\n\nThis error is located at:\n in Foo')).toBe('Invariant Violation: x')
  })

  it('corta em 300 bytes sem partir caractere', () => {
    const out = scrubMessage('é'.repeat(200)) // 400 bytes em UTF-8
    expect(byteLength(out)).toBeLessThanOrEqual(MAX_MESSAGE_BYTES)
    expect(out).toBe('é'.repeat(150))
  })

  it('emoji (4 bytes) no limite não é partido', () => {
    const out = scrubMessage('a'.repeat(298) + '😀')
    expect(out).toBe('a'.repeat(298))
  })

  it('limpa o conteúdo da mensagem', () => {
    expect(scrubMessage('falhou para ana@x.com')).toBe('falhou para <email>')
  })
})

describe('scrubStack (regra 6 + quadros do Hermes)', () => {
  it('quadros do Hermes em release ficam como vieram', () => {
    const stack = [
      'TypeError: undefined is not a function',
      '    at anonymous (address at index.android.bundle:1:2345)',
      '    at fn@1:2345',
      'render@1:99812'
    ].join('\n')
    expect(scrubStack(stack)).toBe(stack)
  })

  it('URL do Metro (dev) fica só com o caminho, sem origem nem query (linha e coluna ficam)', () => {
    const stack = 'Error: x\n    at fn (http://10.0.2.2:8081/index.bundle?platform=android&dev=true:12:34)'
    expect(scrubStack(stack)).toBe('Error: x\n    at fn (index.bundle:12:34)')
  })

  it('até 30 linhas', () => {
    const stack = Array.from({ length: 50 }, (_, i) => `    at f${i}@1:${i}`).join('\n')
    const lines = scrubStack(stack).split('\n')
    expect(lines).toHaveLength(MAX_STACK_LINES)
    expect(lines[29]).toBe('    at f29@1:29')
  })

  it('até 4 KB sem partir caractere', () => {
    const stack = Array.from({ length: 20 }, () => 'ç'.repeat(150)).join('\n') // 20 × 300 B
    const out = scrubStack(stack)
    expect(byteLength(out)).toBeLessThanOrEqual(MAX_STACK_BYTES)
    expect(out.includes('\uFFFD')).toBe(false)
    expect(out.endsWith('ç')).toBe(true)
  })

  it('limpa cada linha', () => {
    expect(scrubStack('Error: em /home/ana/x\n    at f (file:///home/ana/a.js:1:2)')).toBe(
      'Error: em /home/<user>/x\n    at f (/home/<user>/a.js:1:2)'
    )
  })

  it('pilha vazia continua vazia', () => {
    expect(scrubStack('')).toBe('')
  })
})

describe('entrada enorme (a limpeza roda no aparelho: não pode travar)', () => {
  const huge = 200 * 1024
  it.each([
    ['letras', 'a'.repeat(huge)],
    ['parece e-mail', 'a.'.repeat(huge / 2)],
    ['palavras', 'palavra '.repeat(huge / 8)],
    ['parece esquema de URL', 'a+'.repeat(huge / 2)],
    ['aspas abertas', `"${'a'.repeat(huge)}`]
  ])('%s: 200 KB em menos de 100 ms', (_nome, entrada) => {
    const start = performance.now()
    scrubMessage(entrada)
    scrubStack(entrada)
    scrubStack(`${entrada}\n`.repeat(40))
    expect(performance.now() - start).toBeLessThan(100)
  })

  it('o corte antes da limpeza não deixa pedaço de e-mail no fim', () => {
    expect(scrubStack(`${'x '.repeat(511)}ana.silva@exemplo.com.br`)).not.toContain('ana')
  })
})
