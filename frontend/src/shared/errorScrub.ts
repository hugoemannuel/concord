// Limpeza do relatório de erros (docs/adr/0068, regras 1 a 6 do plano
// docs/superpowers/plans/2026-11-25-relatorio-de-erros.md). Roda no aparelho
// antes de o erro sair (renderer e main do Electron) e de novo no servidor,
// com as mesmas regras: nada de token, e-mail, id, nome de usuário do sistema
// ou texto digitado entre aspas.

export const MESSAGE_MAX_BYTES = 300
export const STACK_MAX_LINES = 30
export const STACK_MAX_BYTES = 4096

type Rule = [RegExp, string]

const RULES: Rule[] = [
  // 1. Query string e fragmento de URL (a linha:coluna de um quadro fica).
  [/\b((?:https?|wss?|file):\/\/[^\s?#'"()<>]*)[?#][^\s'"()<>]*?(:\d+:\d+)?(?=[\s'"()<>]|$)/g, '$1$2'],
  // 4. Caminho de usuário (Windows aceita espaço no nome; inclui file:///C:/Users).
  [/\b([A-Za-z]:[\\/]Users[\\/])[^\\/\n"'<>:|?*]+/g, '$1<user>'],
  [/(\/(?:home|Users)\/)[^/\s"'<>:]+/g, '$1<user>'],
  // 2. Tokens.
  [/\bBearer\s+[^\s'"]+/gi, 'Bearer <token>'],
  [/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '<token>'],
  // 3. E-mail e UUID (o UUID antes do token longo: senão vira <token>).
  [/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '<email>'],
  [/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<id>'],
  // Sequência hex/base64url de 32+ com pelo menos um dígito (como no servidor:
  // um nome comprido em camelCase não é token).
  [/(?=[A-Za-z_-]*\d)[A-Za-z0-9_-]{32,}/g, '<token>'],
  // 5. Texto entre aspas com mais de 24 caracteres.
  [/"[^"\n]{25,}"|'[^'\n]{25,}'|`[^`\n]{25,}`/g, '"…"']
]

/** Regras 1 a 5 num texto qualquer. */
export function scrubText(text: string): string {
  return RULES.reduce((out, [re, to]) => out.replace(re, to), text)
}

function utf8Length(codePoint: number): number {
  if (codePoint < 0x80) return 1
  if (codePoint < 0x800) return 2
  return codePoint < 0x10000 ? 3 : 4
}

/** Até `max` bytes em UTF-8, sem partir um caractere. */
export function truncateBytes(text: string, max: number): string {
  let used = 0
  let out = ''
  for (const char of text) {
    used += utf8Length(char.codePointAt(0) ?? 0)
    if (used > max) break
    out += char
  }
  return out
}

/** Mensagem: limpa, numa linha só, até 300 bytes. */
export function scrubMessage(message: string): string {
  const oneLine = scrubText(message).replace(/\s*[\r\n]+\s*/g, ' ').trim()
  return truncateBytes(oneLine, MESSAGE_MAX_BYTES)
}

/**
 * Quadro da pilha com o arquivo reduzido ao caminho: dentro do pacote
 * (app.asar/…), a partir do out/ (build sem pacote) ou sem a origem (web).
 */
function reduceFrame(line: string): string {
  return line
    .replace(/(?:file:\/\/)?[^\s()@]*?app\.asar[\\/]([^\s()]*)/g, (_m, rest: string) =>
      rest.replace(/\\/g, '/')
    )
    .replace(/file:\/\/[^\s()@]*?[\\/](out[\\/][^\s()]*)/g, '$1')
    .replace(/\b(?:https?|wss?):\/\/[^/\s()]+\//g, '')
}

/** Pilha: cada quadro limpo e reduzido; até 30 linhas e 4 KB. */
export function scrubStack(stack: string): string {
  const lines = stack
    .split(/\r?\n/)
    .map((line) => reduceFrame(scrubText(line)).trimEnd())
    .filter((line) => line.trim() !== '')
    .slice(0, STACK_MAX_LINES)
  return truncateBytes(lines.join('\n'), STACK_MAX_BYTES)
}
