import { describe, expect, it } from 'vitest'
import {
  MESSAGE_MAX_BYTES,
  scrubMessage,
  scrubStack,
  scrubText,
  STACK_MAX_BYTES,
  STACK_MAX_LINES,
  truncateBytes
} from './errorScrub'

const bytes = (text: string): number => new TextEncoder().encode(text).length

describe('scrubText (regras 1 a 5)', () => {
  it.each([
    ['query string sai', 'falhou https://x/a?token=1', 'falhou https://x/a'],
    ['fragmento sai', 'abriu https://x/a#segredo depois', 'abriu https://x/a depois'],
    ['query e fragmento juntos', 'https://x/a?token=1#y', 'https://x/a'],
    ['quadro com query mantém linha e coluna', 'at f (https://x/a.js?t=1:10:5)', 'at f (https://x/a.js:10:5)'],
    ['file:// com rota no hash', 'file:///opt/app/index.html#/servers/1', 'file:///opt/app/index.html'],
    ['Bearer', 'header Bearer abc.def-123 recusado', 'header Bearer <token> recusado'],
    [
      'JWT',
      'token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJh inválido',
      'token <token> inválido'
    ],
    ['hex de 32+', 'chave 0123456789abcdef0123456789abcdef', 'chave <token>'],
    ['base64url de 32+', 'ticket aB3_dE6-gH9iJ2kL5mN8oP1qR4sT7uV0', 'ticket <token>'],
    ['curto não é token', 'id abc123', 'id abc123'],
    ['nome comprido sem dígito não é token', 'at useCallStoreSubscriptionWithSelector', 'at useCallStoreSubscriptionWithSelector'],
    ['e-mail', 'conta ana.maria+x@exemplo.com.br não achada', 'conta <email> não achada'],
    ['UUID', 'canal 3f2b8c1e-9a4d-4e7b-8c2a-1b2c3d4e5f60 sumiu', 'canal <id> sumiu'],
    [
      'Windows com espaço no nome',
      'C:\\Users\\Ana Maria\\AppData\\Local\\x.log',
      'C:\\Users\\<user>\\AppData\\Local\\x.log'
    ],
    ['Windows com barra normal', 'C:/Users/x/AppData', 'C:/Users/<user>/AppData'],
    ['Linux', 'em /home/nicolas/projetos/a.ts', 'em /home/<user>/projetos/a.ts'],
    ['macOS', 'em /Users/x/Library/a', 'em /Users/<user>/Library/a'],
    ['file:///C:/Users', 'file:///C:/Users/x/AppData/a.js', 'file:///C:/Users/<user>/AppData/a.js'],
    [
      'aspas longas',
      'Unexpected token in "olá, esta é a mensagem que a pessoa digitou"',
      'Unexpected token in "…"'
    ],
    ['aspas simples longas', "valor 'aaaaaaaaaaaaaaaaaaaaaaaaa' ruim", 'valor "…" ruim'],
    ['crase longa', 'valor `aaaaaaaaaaaaaaaaaaaaaaaaa` ruim', 'valor "…" ruim'],
    [
      'aspas curtas ficam',
      "Cannot read properties of undefined (reading 'id')",
      "Cannot read properties of undefined (reading 'id')"
    ],
    ['24 caracteres entre aspas ficam', `"${'a'.repeat(24)}"`, `"${'a'.repeat(24)}"`]
  ])('%s', (_name, input, want) => {
    expect(scrubText(input)).toBe(want)
  })
})

describe('scrubMessage (regra 6)', () => {
  it('vira uma linha', () => {
    expect(scrubMessage('primeira\n  segunda\r\nterceira')).toBe('primeira segunda terceira')
  })

  it('corta em 300 bytes sem partir caractere', () => {
    const message = scrubMessage('é'.repeat(400))
    expect(bytes(message)).toBeLessThanOrEqual(MESSAGE_MAX_BYTES)
    expect(message).toBe('é'.repeat(150))
  })

  it('limpa antes de cortar', () => {
    expect(scrubMessage('falhou para ana@x.com')).toBe('falhou para <email>')
  })
})

describe('scrubStack (regra 6)', () => {
  it.each([
    [
      'desktop: file:// do app.asar vira o caminho dentro do pacote',
      '    at Xy (file:///C:/Users/x/AppData/Local/Programs/Salinha/resources/app.asar/out/renderer/assets/index-abc.js:1:2)',
      '    at Xy (out/renderer/assets/index-abc.js:1:2)'
    ],
    [
      'web: a origem sai',
      '    at Xy (https://app-salinha.bhrx.com.br/assets/index-abc.js:1:2)',
      '    at Xy (assets/index-abc.js:1:2)'
    ],
    [
      'Firefox: fn@url',
      'Xy@https://app-salinha.bhrx.com.br/assets/index-abc.js:1:2',
      'Xy@assets/index-abc.js:1:2'
    ],
    [
      'main no Windows: caminho nativo até o app.asar sai',
      '    at f (C:\\Users\\Ana Maria\\AppData\\Local\\Programs\\Salinha\\resources\\app.asar\\out\\main\\index.js:10:5)',
      '    at f (out/main/index.js:10:5)'
    ],
    [
      'dev: file:// fora do pacote fica a partir do out/',
      '    at f (file:///home/nicolas/concord/frontend/out/renderer/assets/x.js:3:4)',
      '    at f (out/renderer/assets/x.js:3:4)'
    ],
    [
      'quadro com token na mensagem',
      'Error: falhou para 3f2b8c1e-9a4d-4e7b-8c2a-1b2c3d4e5f60',
      'Error: falhou para <id>'
    ]
  ])('%s', (_name, input, want) => {
    expect(scrubStack(input)).toBe(want)
  })

  it('multilinha: limpa cada quadro e mantém as linhas', () => {
    const stack = [
      'TypeError: x is undefined',
      '    at a (https://app/assets/index-abc.js:1:2)',
      '    at b (https://app/assets/vendor-def.js:3:4)'
    ].join('\n')
    expect(scrubStack(stack)).toBe(
      [
        'TypeError: x is undefined',
        '    at a (assets/index-abc.js:1:2)',
        '    at b (assets/vendor-def.js:3:4)'
      ].join('\n')
    )
  })

  it('até 30 linhas', () => {
    const stack = Array.from({ length: 50 }, (_, i) => `    at f${i} (a.js:1:${i})`).join('\n')
    const lines = scrubStack(stack).split('\n')
    expect(lines).toHaveLength(STACK_MAX_LINES)
    expect(lines.at(-1)).toBe('    at f29 (a.js:1:29)')
  })

  it('até 4 KB sem partir caractere', () => {
    const stack = Array.from({ length: 20 }, () => `    at ${'ç'.repeat(200)} (a.js:1:2)`).join('\n')
    const out = scrubStack(stack)
    expect(bytes(out)).toBeLessThanOrEqual(STACK_MAX_BYTES)
    expect(out).not.toContain('\uFFFD')
    expect(out.length).toBeGreaterThan(1000)
  })

  it('linhas vazias saem', () => {
    expect(scrubStack('Error: x\n\n    at a (a.js:1:2)\n')).toBe('Error: x\n    at a (a.js:1:2)')
  })
})

describe('truncateBytes', () => {
  it.each([
    ['ascii cabe', 'abc', 5, 'abc'],
    ['ascii corta', 'abcdef', 3, 'abc'],
    ['acento não parte', 'aé', 2, 'a'],
    ['emoji (4 bytes) não parte', 'a\u{1F600}b', 4, 'a'],
    ['emoji inteiro cabe', 'a\u{1F600}b', 5, 'a\u{1F600}']
  ])('%s', (_name, input, max, want) => {
    expect(truncateBytes(input, max)).toBe(want)
  })
})
