// Limpeza do relatório de erros (docs/adr/0068, regras 1 a 6 do plano
// docs/superpowers/plans/2026-11-25-relatorio-de-erros.md). Roda no aparelho
// antes de o erro sair (renderer e main do Electron) e de novo no servidor,
// com as mesmas regras: nada de token, e-mail, id, nome de usuário do sistema
// ou texto digitado entre aspas.

export const MESSAGE_MAX_BYTES = 300
export const STACK_MAX_LINES = 30
export const STACK_MAX_BYTES = 4096
// Corte da entrada crua ANTES das regras: uma mensagem de 200 KB não pode travar
// o app. A sobra cobre o que as regras encurtam (uma URL perde a query etc.).
export const RAW_MESSAGE_MAX_BYTES = 2048
export const RAW_LINE_MAX_BYTES = 1024
export const RAW_STACK_MAX_BYTES = 8192

type Rule = [RegExp, string | ((match: string, ...groups: string[]) => string)]

// "?…" de uma URL sem o ":linha:coluna" do fim (que é do quadro e fica).
const dropQuery = (_match: string, before: string, url: string, tail: string): string =>
  before + url + (/(?::\d+){1,2}$/.exec(tail)?.[0] ?? '')

// O e-mail seguido de ":número" é quadro do Hermes/JSC (fn@arquivo.bundle:1:2).
const maskEmail = (_match: string, before: string, email: string, lineCol?: string): string =>
  lineCol ? before + email + lineCol : `${before}<email>`

// Só sequências com algum dígito (hash, token): um nome comprido de função fica.
const maskToken = (match: string): string => (/\d/.test(match) ? '<token>' : match)

// As mesmas regras e na mesma ordem do servidor (backend/internal/apperrors/scrub.go).
// Cada regra que começa por uma sequência casa com o caractere de antes (`before`),
// não com \b nem lookbehind: assim a busca só começa no início da sequência e fica
// linear (senão um texto longo sem espaço vira tempo quadrático).
const RULES: Rule[] = [
  // 1. Query string e fragmento de URL, de qualquer esquema, e de URL relativa
  // (/api/x?token=1; o "?" de uma frase fica). A linha:coluna do quadro fica.
  [/(^|[^a-z0-9+.-])([a-z][a-z0-9+.-]*:\/\/[^\s?#'"()<>]*)([?#][^\s'"()<>]*)/gi, dropQuery],
  [/(^|[\s('"])(\/[^\s?#'"()<>]*)([?#][^\s'"()<>]+)/g, dropQuery],
  // 2. Tokens.
  [/\bBearer\s+[^\s'"]+/gi, 'Bearer <token>'],
  [/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g, '<token>'],
  // 3. E-mail e UUID (antes do token longo: senão viram <token>).
  [/(^|[^\w.%+-])([\w.%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,})(:\d+)?/g, maskEmail],
  [/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<id>'],
  [/[A-Za-z0-9_-]{32,}/g, maskToken],
  // 4. Pasta do usuário (no Windows o nome pode ter espaço e a barra vir repetida).
  [/([A-Za-z]:[\\/]+Users[\\/]+)[^\\/\r\n'"<>:*?|()]+/gi, '$1<user>'],
  [/(\/(?:home|Users)\/)[^/\s'"<>():]+/g, '$1<user>'],
  // 5. Texto entre aspas com mais de 24 caracteres.
  [/"[^"\n]{25,}"|'[^'\n]{25,}'|`[^`\n]{25,}`/g, '"…"']
]

/** Regras 1 a 5 num texto qualquer. */
export function scrubText(text: string): string {
  return RULES.reduce((out, [re, to]) => out.replace(re, to as string), text)
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

/**
 * Corte da entrada crua em `max` bytes. Cortou: a última palavra (pela metade)
 * sai, para não sobrar o começo de um e-mail ou token que as regras não reconhecem.
 */
export function cutRaw(text: string, max: number): string {
  const cut = truncateBytes(text, max)
  if (cut.length === text.length) return cut
  const lastSpace = cut.search(/\s\S*$/)
  return lastSpace > 0 ? cut.slice(0, lastSpace) : cut
}

/** Mensagem: limpa, numa linha só, até 300 bytes. */
export function scrubMessage(message: string): string {
  const raw = cutRaw(message, RAW_MESSAGE_MAX_BYTES)
  const oneLine = scrubText(raw).replace(/\s*[\r\n]+\s*/g, ' ').trim()
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

/** As linhas cruas que entram na limpeza: não vazias, até 30, 1 KB cada e 8 KB no total. */
function rawStackLines(stack: string): string[] {
  const lines: string[] = []
  let total = 0
  for (const line of stack.split(/\r?\n/, 4 * STACK_MAX_LINES)) {
    if (line.trim() === '') continue
    const cut = cutRaw(line, RAW_LINE_MAX_BYTES)
    total += cut.length
    if (total > RAW_STACK_MAX_BYTES || lines.push(cut) === STACK_MAX_LINES) break
  }
  return lines
}

/** Pilha: cada quadro limpo e reduzido; até 30 linhas e 4 KB. */
export function scrubStack(stack: string): string {
  const lines = rawStackLines(stack)
    .map((line) => reduceFrame(scrubText(line)).trimEnd())
    .filter((line) => line.trim() !== '')
  return truncateBytes(lines.join('\n'), STACK_MAX_BYTES)
}
