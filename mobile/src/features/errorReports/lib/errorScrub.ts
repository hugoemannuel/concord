// Limpeza do erro antes de sair do aparelho (ADR 0068, regras 1–6 do plano
// docs/superpowers/plans/2026-11-25-relatorio-de-erros.md). Cópia adaptada da do
// desktop (frontend/src/shared/errorScrub.ts), como pede o ADR 0021: o servidor
// limpa de novo com as mesmas regras.

export const MAX_MESSAGE_BYTES = 300
export const MAX_STACK_LINES = 30
export const MAX_STACK_BYTES = 4096

type Rule = [RegExp, string | ((match: string) => string)]

// Sequência de token só vira marcador se misturar letra e número: um nome de função
// longo (só letras) é a parte útil da pilha e fica.
const tokenOrKeep = (match: string): string => (/\d/.test(match) && /[A-Za-z]/.test(match) ? '<token>' : match)

// A ordem importa: a URL perde a query antes de tudo; JWT, e-mail e UUID antes da
// regra genérica de token (que também casaria com eles).
const RULES: Rule[] = [
  [/([a-z][a-z0-9+.-]*:\/\/[^\s?#"'`()]*)[?#][^\s"'`()]*/gi, '$1'],
  [/Bearer\s+[^\s"'`]+/g, 'Bearer <token>'],
  [/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '<token>'],
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '<email>'],
  [/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<id>'],
  [/[A-Za-z0-9_-]{32,}/g, tokenOrKeep],
  [/([A-Za-z]:[\\/]Users[\\/])[^\\/\s"'`()]+/g, '$1<user>'],
  [/(\/(?:home|Users)\/)[^/\s"'`()]+/g, '$1<user>'],
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

/** Regra 6: mensagem numa linha só (a primeira), limpa, até 300 bytes. */
export function scrubMessage(message: string): string {
  const firstLine = message.split(/\r?\n/, 1)[0] ?? ''
  return truncateBytes(scrubText(firstLine).trim(), MAX_MESSAGE_BYTES)
}

// Quadro com URL: fica só o caminho (sem origem). O Metro do dev manda
// http://10.0.2.2:8081/index.bundle; o Hermes em release manda
// "address at index.android.bundle:1:2345" ou "fn@1:2345", que já ficam como estão.
function stripOrigin(line: string): string {
  return line.replace(/https?:\/\/[^/\s()]+\//gi, '').replace(/file:\/\//gi, '')
}

/** Regra 6: até 30 linhas e 4 KB, cada linha limpa e sem a origem das URLs. */
export function scrubStack(stack: string): string {
  const lines = stack.split(/\r?\n/).slice(0, MAX_STACK_LINES)
  return truncateBytes(lines.map((line) => stripOrigin(scrubText(line))).join('\n'), MAX_STACK_BYTES)
}
