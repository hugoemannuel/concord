package apperrors

import (
	"os"
	"testing"
)

type lookupCase struct {
	name              string
	line, col         int
	source            string
	wantLine, wantCol int
	wantName          string
	ok                bool
}

func checkLookups(t *testing.T, m *SourceMap, tests []lookupCase) {
	t.Helper()
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			src, line, col, name, ok := m.Lookup(tt.line, tt.col)
			if ok != tt.ok || src != tt.source || line != tt.wantLine || col != tt.wantCol || name != tt.wantName {
				t.Errorf("Lookup(%d, %d) = %q %d:%d %q %v; quer %q %d:%d %q %v", tt.line, tt.col,
					src, line, col, name, ok, tt.source, tt.wantLine, tt.wantCol, tt.wantName, tt.ok)
			}
		})
	}
}

// O map de testdata/ saiu do esbuild (--minify --sourcemap=external
// --sources-content=false); as posições esperadas foram conferidas com o
// @jridgewell/trace-mapping (o leitor que o Vite usa).
func TestSourceMapReal(t *testing.T) {
	raw, err := os.ReadFile("testdata/index-Ab3_xY9z.js.map")
	if err != nil {
		t.Fatal(err)
	}
	m, err := ParseSourceMap(raw)
	if err != nil {
		t.Fatal(err)
	}
	const chat, main = "../src/features/chat/mensagem.ts", "../src/main.ts"
	checkLookups(t, m, []lookupCase{
		{"início", 1, 1, chat, 1, 8, "", true},
		{"nome da função", 1, 10, chat, 1, 17, "lerId", true},
		{"acesso ao id", 1, 22, chat, 2, 10, "item", true},
		{"entre segmentos vale o anterior", 1, 23, chat, 2, 10, "item", true},
		{"outro arquivo", 1, 101, main, 4, 3, "", true},
		{"fim da linha", 1, 143, main, 5, 1, "", true},
		{"linha que não existe", 2, 1, "", 0, 0, "", false},
		{"linha zero", 0, 1, "", 0, 0, "", false},
	})
}

func TestSourceMapEscritoAMao(t *testing.T) {
	// linha 1: AAAA (a.ts 1:1); linha 2 vazia; linha 3: AACA (a.ts 2:1),
	// E (coluna 2 sem origem), EAAEA (coluna 4 → a.ts 2:3, nome x).
	m, err := ParseSourceMap([]byte(`{"version":3,"sources":["a.ts"],"names":["x"],"mappings":"AAAA;;AACA,E,EAAEA","sourcesContent":["ignorado"]}`))
	if err != nil {
		t.Fatal(err)
	}
	checkLookups(t, m, []lookupCase{
		{"primeira linha", 1, 10, "a.ts", 1, 1, "", true},
		{"linha vazia", 2, 1, "", 0, 0, "", false},
		{"segmento com origem", 3, 1, "a.ts", 2, 1, "", true},
		{"segmento sem origem", 3, 3, "", 0, 0, "", false},
		{"com nome", 3, 5, "a.ts", 2, 3, "x", true},
		{"depois do último", 3, 99, "a.ts", 2, 3, "x", true},
	})
}

func TestParseSourceMapRecusa(t *testing.T) {
	tests := map[string]string{
		"json quebrado":        `{`,
		"versão 2":             `{"version":2,"sources":[],"names":[],"mappings":""}`,
		"caractere inválido":   `{"version":3,"sources":["a"],"names":[],"mappings":"AA!A"}`,
		"vlq cortado":          `{"version":3,"sources":["a"],"names":[],"mappings":"AAAg"}`,
		"segmento de 2 campos": `{"version":3,"sources":["a"],"names":[],"mappings":"AA"}`,
		"vlq grande demais":    `{"version":3,"sources":["a"],"names":[],"mappings":"gggggggA"}`,
	}
	for name, raw := range tests {
		if _, err := ParseSourceMap([]byte(raw)); err == nil {
			t.Errorf("%s: devia recusar", name)
		}
	}
}

func TestSourceMapIndiceForaDaLista(t *testing.T) {
	// fonte 1 e nome 3 não existem: o quadro não é traduzido (nem quebra).
	m, err := ParseSourceMap([]byte(`{"version":3,"sources":["a"],"names":[],"mappings":"ACAAG"}`))
	if err != nil {
		t.Fatal(err)
	}
	if _, _, _, _, ok := m.Lookup(1, 1); ok {
		t.Error("fonte inexistente não pode ser traduzida")
	}
}
