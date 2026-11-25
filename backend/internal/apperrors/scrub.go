package apperrors

import (
	"regexp"
	"strings"
	"unicode/utf8"
)

// Limpeza do texto de um erro (ADR 0068 e o plano, regras 1–6): o aparelho já
// limpa antes de mandar; o servidor limpa de novo com as mesmas regras, para o
// caso de um cliente antigo ou adulterado. Limpar duas vezes dá o mesmo texto.
const (
	maxMessage    = 300
	maxStackLines = 30
	maxStackBytes = 4 << 10
)

var (
	// 1. query string e fragmento de URL (a linha e a coluna do quadro ficam).
	reURLTail = regexp.MustCompile(`([A-Za-z][A-Za-z0-9+.-]*://[^\s?#'"()<>]*)[?#][^\s'"()<>]*`)
	reLineCol = regexp.MustCompile(`(:\d+){1,2}$`)
	// 2. tokens.
	reBearer    = regexp.MustCompile(`(?i)\bBearer\s+[^\s'"]+`)
	reJWT       = regexp.MustCompile(`eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*`)
	reLongToken = regexp.MustCompile(`[A-Za-z0-9_-]{32,}`)
	// 3. e-mail e UUID. O e-mail seguido de ":número" é quadro do Hermes/JSC
	// (fn@arquivo.bundle:1:2), não e-mail.
	reEmail = regexp.MustCompile(`[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}(:\d+)?`)
	reUUID  = regexp.MustCompile(`(?i)\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b`)
	// 4. pasta do usuário (no Windows o nome pode ter espaço).
	reWinUser  = regexp.MustCompile(`(?i)([A-Za-z]:[\\/]+Users[\\/]+)[^\\/\r\n'"<>:*?|()]+`)
	reUnixUser = regexp.MustCompile(`(/(?:home|Users)/)[^/\s'"<>():]+`)
	// 5. texto entre aspas com mais de 24 caracteres (pode ser algo digitado).
	reQuoted = regexp.MustCompile("\"[^\"\\n]{25,}\"|'[^'\\n]{25,}'|`[^`\\n]{25,}`")
	// 6. no quadro, a URL vira só o caminho.
	reAsar   = regexp.MustCompile(`[^\s()'"]*app\.asar/`)
	reOrigin = regexp.MustCompile(`\b[A-Za-z][A-Za-z0-9+.-]*://[^/\s()'"]*/`)
)

// scrubText aplica as regras 1–5 a um texto qualquer.
func scrubText(s string) string {
	s = reURLTail.ReplaceAllStringFunc(s, dropQuery)
	s = reBearer.ReplaceAllString(s, "Bearer <token>")
	s = reJWT.ReplaceAllString(s, "<token>")
	s = reEmail.ReplaceAllStringFunc(s, maskEmail)
	s = reUUID.ReplaceAllString(s, "<id>")
	s = reLongToken.ReplaceAllStringFunc(s, maskToken)
	s = reWinUser.ReplaceAllString(s, "${1}<user>")
	s = reUnixUser.ReplaceAllString(s, "${1}<user>")
	return reQuoted.ReplaceAllString(s, `"…"`)
}

// dropQuery: a URL sem ?… e #…, mas com o ":linha:coluna" do fim, se houver.
func dropQuery(m string) string {
	i := strings.IndexAny(m, "?#")
	return m[:i] + reLineCol.FindString(m[i:])
}

func maskEmail(m string) string {
	if strings.Contains(m[strings.LastIndexByte(m, '@'):], ":") {
		return m
	}
	return "<email>"
}

// maskToken: só sequências com algum dígito (hash, token); um nome comprido de
// componente ou função fica.
func maskToken(m string) string {
	if strings.ContainsAny(m, "0123456789") {
		return "<token>"
	}
	return m
}

// scrubMessage: limpa, junta numa linha só e corta em maxMessage bytes.
func scrubMessage(s string) string {
	return cut(strings.Join(strings.Fields(scrubText(s)), " "), maxMessage)
}

// scrubStack: limpa cada linha, reduz a URL do quadro ao caminho e corta em
// maxStackLines linhas e maxStackBytes (numa linha inteira).
func scrubStack(s string) string {
	var lines []string
	for line := range strings.SplitSeq(s, "\n") {
		line = strings.TrimRight(line, " \t\r")
		if line == "" {
			continue
		}
		lines = append(lines, reducePath(scrubText(line)))
		if len(lines) == maxStackLines {
			break
		}
	}
	return cutLines(strings.Join(lines, "\n"), maxStackBytes)
}

func reducePath(line string) string {
	return reOrigin.ReplaceAllString(reAsar.ReplaceAllString(line, ""), "")
}

// cutLines corta em n bytes na última linha inteira; uma linha só maior que n
// é cortada no meio (sem partir caractere).
func cutLines(s string, n int) string {
	if len(s) <= n {
		return s
	}
	if i := strings.LastIndexByte(s[:n+1], '\n'); i > 0 {
		return s[:i]
	}
	return cutBytes(s, n)
}

// cut: sem espaços nas pontas e no máximo n bytes, sem partir um caractere.
func cut(s string, n int) string {
	return cutBytes(strings.TrimSpace(s), n)
}

func cutBytes(s string, n int) string {
	for len(s) > n {
		_, size := utf8.DecodeLastRuneInString(s)
		s = s[:len(s)-size]
	}
	return s
}
