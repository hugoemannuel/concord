package apperrors

import (
	"os"
	"path/filepath"
	"testing"
)

const fixtureMap = "testdata/index-Ab3_xY9z.js.map"

// mapsDir: uma pasta de source maps com o map de testdata/ em cada nome pedido.
func mapsDir(t *testing.T, names ...string) string {
	t.Helper()
	raw, err := os.ReadFile(fixtureMap)
	if err != nil {
		t.Fatal(err)
	}
	dir := t.TempDir()
	for _, n := range names {
		if err := os.WriteFile(filepath.Join(dir, n+".map"), raw, 0o600); err != nil {
			t.Fatal(err)
		}
	}
	return dir
}

func TestTranslate(t *testing.T) {
	tr := NewTranslator(mapsDir(t, "index-Ab3_xY9z.js"))
	in := "TypeError: x\n" +
		"    at e (assets/index-Ab3_xY9z.js:1:22)\n" +
		"    at u (out/renderer/assets/index-Ab3_xY9z.js:1:101)\n" +
		"    at outro (assets/vendor-Zz9_Yy8x.js:1:1)\n" +
		"    at index-Ab3_xY9z.js:9:9"
	want := "TypeError: x\n" +
		"    at e (src/features/chat/mensagem.ts:2:10 (item))\n" +
		"    at u (src/main.ts:4:3)\n" +
		"    at outro (assets/vendor-Zz9_Yy8x.js:1:1)\n" +
		"    at index-Ab3_xY9z.js:9:9"
	if got := tr.Translate(in); got != want {
		t.Errorf("Translate\n got %q\nwant %q", got, want)
	}
}

func TestTranslateSemTraducaoDevolveVazio(t *testing.T) {
	stack := "    at e (assets/index-Ab3_xY9z.js:1:22)"
	tests := map[string]*Translator{
		"sem pasta":         NewTranslator(""),
		"pasta inexistente": NewTranslator(filepath.Join(t.TempDir(), "nao-existe")),
		"sem o map":         NewTranslator(mapsDir(t, "outro.js")),
		"nil":               nil,
	}
	for name, tr := range tests {
		if got := tr.Translate(stack); got != "" {
			t.Errorf("%s: Translate = %q, quer vazio", name, got)
		}
	}
	if got := NewTranslator(mapsDir(t, "index-Ab3_xY9z.js")).Translate("Error: sem quadros\n    at handler.go:12"); got != "" {
		t.Errorf("pilha sem .js = %q, quer vazio", got)
	}
}

func TestTranslateNaoSaiDaPasta(t *testing.T) {
	raw, err := os.ReadFile(fixtureMap)
	if err != nil {
		t.Fatal(err)
	}
	parent := t.TempDir()
	dir := filepath.Join(parent, "maps")
	if err := os.Mkdir(dir, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(parent, "fora.js.map"), raw, 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(filepath.Join(parent, "fora.js.map"), filepath.Join(dir, "link.js.map")); err != nil {
		t.Fatal(err)
	}
	tr := NewTranslator(dir)
	for _, stack := range []string{"    at f (../fora.js:1:22)", "    at f (link.js:1:22)"} {
		if got := tr.Translate(stack); got != "" {
			t.Errorf("Translate(%q) = %q: leu fora da pasta", stack, got)
		}
	}
}

func TestTranslateLimiteDeTamanho(t *testing.T) {
	tr := NewTranslator(mapsDir(t, "index-Ab3_xY9z.js"))
	tr.maxBytes = 10
	if got := tr.Translate("    at e (assets/index-Ab3_xY9z.js:1:22)"); got != "" {
		t.Errorf("map acima do limite foi lido: %q", got)
	}
}

func TestTranslateGuardaSoDoisMapas(t *testing.T) {
	tr := NewTranslator(mapsDir(t, "a.js", "b.js", "c.js"))
	for _, n := range []string{"a.js", "b.js", "a.js", "c.js"} {
		if tr.Translate("at f ("+n+":1:22)") == "" {
			t.Fatalf("%s não traduziu", n)
		}
	}
	var names []string
	for _, c := range tr.cache {
		names = append(names, c.name)
	}
	if len(names) != 2 || names[0] != "c.js" || names[1] != "a.js" {
		t.Errorf("cache = %v, quer [c.js a.js] (b saiu por ser o menos usado)", names)
	}
}

func TestCleanSource(t *testing.T) {
	tests := map[string]string{
		"../../src/renderer/src/features/x.tsx": "src/renderer/src/features/x.tsx",
		"./src/a.ts":                            "src/a.ts",
		"webpack://app/src/a.ts":                "src/a.ts",
		"src/a.ts":                              "src/a.ts",
	}
	for in, want := range tests {
		if got := cleanSource(in); got != want {
			t.Errorf("cleanSource(%q) = %q, quer %q", in, got, want)
		}
	}
}
