package apperrors

import (
	"crypto/sha256"
	"encoding/hex"
	"path"
	"regexp"
	"strconv"
	"strings"
)

// Impressão digital (só no servidor; o cliente não é confiável):
// sha256(source \x00 kind \x00 msgNorm \x00 frame1 \x00 frame2 \x00 frame3) em
// hex. msgNorm = mensagem limpa com os números trocados por N; cada quadro =
// nome do arquivo sem o hash do Vite, sem linha e coluna (mudam a cada build).
// Em JS o nome da função fica de fora (o web e o Hermes são minificados e o
// nome muda a cada build); no Go ela entra. Faltando quadro, o lugar fica vazio.
const fingerprintFrames = 3

// frame: um quadro da pilha (Col = 0 nos quadros do Go).
type frame struct {
	Func string
	File string
	Line int
	Col  int
}

var (
	reDigits = regexp.MustCompile(`\d+`)
	// V8: "at fn (url:l:c)" e "at url:l:c"; Hermes põe "address at " na url.
	reV8Paren = regexp.MustCompile(`^\s*at\s+(.*?)\s*\((.+):(\d+):(\d+)\)\s*$`)
	reV8Bare  = regexp.MustCompile(`^\s*at\s+()(\S.*):(\d+):(\d+)\s*$`)
	// Hermes/JSC/Firefox: "fn@url:l:c".
	reAtFrame = regexp.MustCompile(`^\s*([^@\s]*)@(.+):(\d+):(\d+)\s*$`)
	// Go: "pkg.Func(args)" e, na linha seguinte, "\t/caminho/arquivo.go:12 +0x1d".
	reGoFile = regexp.MustCompile(`^\t(.+\.go):(\d+)(?: \+0x[0-9a-f]+)?$`)
	// hash do Vite/Rollup no nome do arquivo: index-D8OJ_SLt.js → index.js.
	reViteHash = regexp.MustCompile(`^(.+?)-[A-Za-z0-9_-]{6,12}\.(m?js|cjs)$`)
)

// Fingerprint do erro já limpo.
func Fingerprint(source, kind, message, stack string) string {
	parts := []string{source, kind, reDigits.ReplaceAllString(message, "N")}
	frames := appFrames(stack)
	for i := range fingerprintFrames {
		key := ""
		if i < len(frames) {
			key = frameKey(frames[i])
		}
		parts = append(parts, key)
	}
	sum := sha256.Sum256([]byte(strings.Join(parts, "\x00")))
	return hex.EncodeToString(sum[:])
}

func frameKey(f frame) string {
	file := stripViteHash(path.Base(strings.ReplaceAll(f.File, `\`, "/")))
	if strings.HasSuffix(file, ".go") {
		return f.Func + " " + file
	}
	return file
}

func stripViteHash(base string) string {
	return reViteHash.ReplaceAllString(base, "$1.$2")
}

// appFrames: os quadros da pilha que dá para ler, sem os do runtime do Go,
// do recovery e do gin (que aparecem em todo panic).
func appFrames(stack string) []frame {
	lines := strings.Split(stack, "\n")
	var out []frame
	for i := 0; i < len(lines); i++ {
		if f, ok := parseJSFrame(lines[i]); ok {
			out = append(out, f)
			continue
		}
		if i+1 < len(lines) {
			if f, ok := parseGoFrame(lines[i], lines[i+1]); ok {
				i++
				out = appendGoFrame(out, f)
			}
		}
	}
	return out
}

func parseJSFrame(line string) (frame, bool) {
	for _, re := range []*regexp.Regexp{reV8Paren, reV8Bare, reAtFrame} {
		if m := re.FindStringSubmatch(line); m != nil {
			return frame{
				Func: strings.TrimPrefix(m[1], "async "),
				File: strings.TrimPrefix(m[2], "address at "),
				Line: atoi(m[3]),
				Col:  atoi(m[4]),
			}, true
		}
	}
	return frame{}, false
}

// parseGoFrame lê o par "função(args)" + "\tarquivo.go:linha".
func parseGoFrame(fnLine, fileLine string) (frame, bool) {
	m := reGoFile.FindStringSubmatch(fileLine)
	if m == nil || strings.HasPrefix(fnLine, "\t") {
		return frame{}, false
	}
	fn := strings.TrimSpace(fnLine)
	if strings.HasSuffix(fn, ")") {
		fn = fn[:strings.LastIndexByte(fn, '(')]
	}
	return frame{Func: fn, File: m[1], Line: atoi(m[2])}, true
}

// appendGoFrame junta o quadro do app, com a função sem o caminho do pacote.
func appendGoFrame(out []frame, f frame) []frame {
	if goNoise(f) {
		return out
	}
	f.Func = f.Func[strings.LastIndexByte(f.Func, '/')+1:]
	return append(out, f)
}

func goNoise(f frame) bool {
	return strings.Contains(f.File, "/src/runtime/") ||
		f.Func == "panic" ||
		strings.HasPrefix(f.Func, "created by ") ||
		strings.Contains(f.Func, "github.com/gin-gonic/") ||
		strings.Contains(f.Func, "platform/recovery.")
}

func atoi(s string) int {
	n, _ := strconv.Atoi(s)
	return n
}
