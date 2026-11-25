package apperrors

import (
	"fmt"
	"io"
	"log"
	"os"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"sync"
)

// Tradução da pilha do renderer pelos source maps "hidden" do build (ADR
// 0068): o deploy põe os .map em SOURCEMAPS_DIR (padrão /opt/concord/sourcemaps),
// fora da pasta pública. Cada quadro "arquivo.js:l:c" vira "src/…/x.tsx:L:C
// (nome)"; o que não achar fica como está. Pasta vazia ou ausente: sem tradução.
const (
	DefaultSourceMapsDir = "/opt/concord/sourcemaps"
	maxMapBytes          = 16 << 20
	mapCacheSize         = 2
)

var (
	// o caminho antes do nome do arquivo é trocado junto; só o nome procura o .map.
	reJSLocation = regexp.MustCompile(`([^\s()@]*/)?([A-Za-z0-9._-]+\.js):(\d+):(\d+)`)
	reMapName    = regexp.MustCompile(`^[A-Za-z0-9._-]+\.js$`)
	reSourceURL  = regexp.MustCompile(`^[A-Za-z][A-Za-z0-9+.-]*://[^/]*/`)
)

type cachedMap struct {
	name string
	m    *SourceMap
}

// Translator lê os .map da pasta sob demanda e guarda os 2 últimos usados. O
// mutex só protege o cache: ler e decodificar o .map fica fora dele.
type Translator struct {
	dir      string
	maxBytes int64
	readMap  func(name string) *SourceMap
	mu       sync.Mutex
	cache    []cachedMap
}

func NewTranslator(dir string) *Translator {
	t := &Translator{dir: dir, maxBytes: maxMapBytes}
	t.readMap = t.read
	return t
}

// Translate devolve a pilha traduzida, ou "" quando nenhum quadro traduziu.
func (t *Translator) Translate(stack string) string {
	if t == nil || t.dir == "" {
		return ""
	}
	lines := strings.Split(stack, "\n")
	translated := false
	for i, line := range lines {
		if out, ok := t.translateLine(line); ok {
			lines[i], translated = out, true
		}
	}
	if !translated {
		return ""
	}
	return strings.Join(lines, "\n")
}

// translateLine troca o último local "arquivo.js:l:c" da linha (o do quadro).
func (t *Translator) translateLine(line string) (string, bool) {
	all := reJSLocation.FindAllStringSubmatchIndex(line, -1)
	if all == nil {
		return line, false
	}
	loc := all[len(all)-1]
	m := t.load(line[loc[4]:loc[5]])
	if m == nil {
		return line, false
	}
	l, _ := strconv.Atoi(line[loc[6]:loc[7]])
	c, _ := strconv.Atoi(line[loc[8]:loc[9]])
	src, srcLine, srcCol, name, ok := m.Lookup(l, c)
	if !ok {
		return line, false
	}
	return line[:loc[0]] + formatLocation(src, srcLine, srcCol, name) + line[loc[1]:], true
}

func formatLocation(src string, line, col int, name string) string {
	out := fmt.Sprintf("%s:%d:%d", cleanSource(src), line, col)
	if name != "" {
		out += " (" + name + ")"
	}
	return out
}

// cleanSource: o caminho do código no repositório, sem esquema e sem "../".
func cleanSource(src string) string {
	src = reSourceURL.ReplaceAllString(src, "")
	for {
		trimmed := strings.TrimPrefix(strings.TrimPrefix(src, "../"), "./")
		if trimmed == src {
			return src
		}
		src = trimmed
	}
}

// load: o mapa de name (do cache ou da pasta); nil sem mapa. Dois pedidos ao
// mesmo tempo pelo mesmo mapa que não está no cache leem o arquivo os dois.
func (t *Translator) load(name string) *SourceMap {
	if m := t.cached(name); m != nil {
		return m
	}
	m := t.readMap(name)
	if m != nil {
		t.remember(name, m)
	}
	return m
}

// cached: o mapa do cache, que passa a ser o mais recente.
func (t *Translator) cached(name string) *SourceMap {
	t.mu.Lock()
	defer t.mu.Unlock()
	for i, c := range t.cache {
		if c.name == name {
			t.cache = append([]cachedMap{c}, append(t.cache[:i:i], t.cache[i+1:]...)...)
			return c.m
		}
	}
	return nil
}

func (t *Translator) remember(name string, m *SourceMap) {
	t.mu.Lock()
	defer t.mu.Unlock()
	t.cache = slices.DeleteFunc(t.cache, func(c cachedMap) bool { return c.name == name })
	t.cache = append([]cachedMap{{name, m}}, t.cache...)
	if len(t.cache) > mapCacheSize {
		t.cache = t.cache[:mapCacheSize]
	}
}

// read abre <name>.map só dentro da pasta (os.Root não segue link para fora).
func (t *Translator) read(name string) *SourceMap {
	if !reMapName.MatchString(name) {
		return nil
	}
	raw, err := readInDir(t.dir, name+".map", t.maxBytes)
	if err != nil {
		return nil
	}
	m, err := ParseSourceMap(raw)
	if err != nil {
		log.Printf("[apperrors] source map %s: %v", name, err)
		return nil
	}
	return m
}

func readInDir(dir, file string, maxBytes int64) ([]byte, error) {
	root, err := os.OpenRoot(dir)
	if err != nil {
		return nil, err
	}
	defer root.Close()
	f, err := root.Open(file)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	raw, err := io.ReadAll(io.LimitReader(f, maxBytes+1))
	if err != nil {
		return nil, err
	}
	if int64(len(raw)) > maxBytes {
		return nil, fmt.Errorf("%s maior que %d bytes", file, maxBytes)
	}
	return raw, nil
}
