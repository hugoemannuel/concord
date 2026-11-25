// Limpeza do erro antes de sair do aparelho (ADR 0068, regras 1–6 do plano
// docs/superpowers/plans/2026-11-25-relatorio-de-erros.md). Cópia adaptada da do
// desktop (frontend/src/shared/errorScrub.ts), como pede o ADR 0021: o servidor
// limpa de novo com as mesmas regras.

export const MAX_MESSAGE_BYTES = 300
export const MAX_STACK_LINES = 30
export const MAX_STACK_BYTES = 4096
// Corte da entrada crua ANTES das regras: uma mensagem de 200 KB não pode travar
// o app. A sobra cobre o que as regras encurtam (uma URL perde a query etc.).
export const RAW_MESSAGE_MAX_BYTES = 2048
export const RAW_LINE_MAX_BYTES = 1024
export const RAW_STACK_MAX_BYTES = 8192

type Rule = [RegExp, string | ((match: string, ...groups: string[]) => string)]

// "?…" de uma URL sem o ":linha:coluna" do fim (que é do quadro e fica).
const dropQuery = (_match: string, before: string, url: string, tail: string): string =>
  before + url + (/(?::\d+){1,2}$/.exec(tail)?.[0] ?? '')

// O e-mail seguido de ":número" é quadro do Hermes/JSC (fn@index.android.bundle:1:2).
const maskEmail = (_match: string, before: string, email: string, lineCol?: string): string =>
  lineCol ? before + email + lineCol : `${before}<email>`

// Sequência de token só vira marcador se tiver dígito: um nome de função longo (só
// letras) é a parte útil da pilha e fica.
const maskToken = (match: string): string => (/\d/.test(match) ? '<token>' : match)

// As mesmas regras e na mesma ordem do servidor (backend/internal/apperrors/scrub.go).
// A URL perde a query antes de tudo; JWT, e-mail e UUID antes da regra genérica de
// token (que também casaria com eles). Cada regra que começa por uma sequência casa
// com o caractere de antes (`before`), não com \b nem lookbehind: a busca só começa
// no início da sequência e fica linear (senão um texto longo sem espaço vira tempo
// quadrático).
const RULES: Rule[] = [
  [/(^|[^a-z0-9+.-])([a-z][a-z0-9+.-]*:\/\/[^\s?#'"()<>]*)([?#][^\s'"()<>]*)/gi, dropQuery],
  // URL relativa (/api/x?token=1); o "?" de uma frase fica.
  [/(^|[\s('"])(\/[^\s?#'"()<>]*)([?#][^\s'"()<>]+)/g, dropQuery],
  [/\bBearer\s+[^\s'"]+/gi, 'Bearer <token>'],
  [/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g, '<token>'],
  [/(^|[^\w.%+-])([\w.%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,})(:\d+)?/g, maskEmail],
  [/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<id>'],
  [/[A-Za-z0-9_-]{32,}/g, maskToken],
  // Pasta do usuário (no Windows o nome pode ter espaço e a barra vir repetida).
  [/([A-Za-z]:[\\/]+Users[\\/]+)[^\\/\r\n'"<>:*?|()]+/gi, '$1<user>'],
  [/(\/(?:home|Users)\/)[^/\s'"<>():]+/g, '$1<user>'],
  [/"[^"\n]{25,}"|'[^'\n]{25,}'|`[^`\n]{25,}`/g, '"…"']
]

/** Regras 1–5: query e fragmento, tokens, e-mail, UUID, caminho de usuário, aspas longas. */
export function scrubText(text: string): string {
  return RULES.reduce((out, [pattern, replacement]) => out.replace(pattern, replacement as string), text)
}

function utf8Bytes(codePoint: number): number {
  if (codePoint < 0x80) return 1
  if (codePoint < 0x800) return 2
  return codePoint < 0x10000 ? 3 : 4
}

export function byteLength(text: string): number {
  let total = 0
  for (const char of text) total += utf8Bytes(char.codePointAt(0) ?? 0)
  return total
}

/** Corta em `max` bytes de UTF-8 sem partir um caractere no meio. */
export function truncateBytes(text: string, max: number): string {
  let total = 0
  let out = ''
  for (const char of text) {
    total += utf8Bytes(char.codePointAt(0) ?? 0)
    if (total > max) break
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

/** Regra 6: mensagem numa linha só (a primeira), limpa, até 300 bytes. */
export function scrubMessage(message: string): string {
  const firstLine = message.split(/\r?\n/, 1)[0] ?? ''
  return truncateBytes(scrubText(cutRaw(firstLine, RAW_MESSAGE_MAX_BYTES)).trim(), MAX_MESSAGE_BYTES)
}

// Quadro com URL: fica só o caminho (sem origem). O Metro do dev manda
// http://10.0.2.2:8081/index.bundle; o Hermes em release manda
// "address at index.android.bundle:1:2345" ou "fn@1:2345", que já ficam como estão.
function stripOrigin(line: string): string {
  return line.replace(/https?:\/\/[^/\s()]+\//gi, '').replace(/file:\/\//gi, '')
}

/** As linhas cruas que entram na limpeza: até 30, 1 KB cada e 8 KB no total. */
function rawStackLines(stack: string): string[] {
  const lines: string[] = []
  let total = 0
  for (const line of stack.split(/\r?\n/, MAX_STACK_LINES)) {
    const cut = cutRaw(line, RAW_LINE_MAX_BYTES)
    total += cut.length
    if (total > RAW_STACK_MAX_BYTES) break
    lines.push(cut)
  }
  return lines
}

/** Regra 6: até 30 linhas e 4 KB, cada linha limpa e sem a origem das URLs. */
export function scrubStack(stack: string): string {
  const lines = rawStackLines(stack)
  return truncateBytes(lines.map((line) => stripOrigin(scrubText(line))).join('\n'), MAX_STACK_BYTES)
}
