package message

import "strings"

// StripCode tira o código (bloco ``` no começo da linha e `trecho`) do texto
// antes de procurar menções: menção dentro de código não pinga, como no
// Discord. Cada código vira um espaço (não cola as palavras de volta). Mesma
// regra do app (features/chat/lib/markdown/stripCode.ts): "\" antes de
// pontuação escapa (a crase escapada não abre código).
func StripCode(content string) string {
	var out strings.Builder
	out.Grow(len(content))
	for i := 0; i < len(content); {
		c := content[i]
		if c == '\\' && i+1 < len(content) && isASCIIPunct(content[i+1]) {
			out.WriteString(content[i : i+2])
			i += 2
			continue
		}
		if c != '`' {
			out.WriteByte(c)
			i++
			continue
		}
		n := backtickRun(content, i)
		end := codeEnd(content, i, n)
		if end < 0 {
			out.WriteString(content[i : i+n])
			i += n
			continue
		}
		out.WriteByte(' ')
		i = end
	}
	return out.String()
}

const codeFence = "```"

func isASCIIPunct(b byte) bool {
	return (b >= '!' && b <= '/') || (b >= ':' && b <= '@') || (b >= '[' && b <= '`') || (b >= '{' && b <= '~')
}

func backtickRun(s string, i int) int {
	j := i
	for j < len(s) && s[j] == '`' {
		j++
	}
	return j - i
}

// findBacktickRun acha a próxima sequência de exatamente n crases a partir de start.
func findBacktickRun(s string, n int, start int) int {
	for j := start; j < len(s); {
		if s[j] != '`' {
			j++
			continue
		}
		m := backtickRun(s, j)
		if m == n {
			return j
		}
		j += m
	}
	return -1
}

// codeEnd: onde termina o código que começa em i (n crases), ou -1 se não fecha.
func codeEnd(s string, i int, n int) int {
	lineStart := i == 0 || s[i-1] == '\n'
	if n >= len(codeFence) && lineStart {
		close := strings.Index(s[i+len(codeFence):], codeFence)
		if close < 0 {
			return -1
		}
		return i + len(codeFence) + close + len(codeFence)
	}
	close := findBacktickRun(s, n, i+n)
	if close < 0 {
		return -1
	}
	return close + n
}
