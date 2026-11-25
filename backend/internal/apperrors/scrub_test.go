package apperrors

import (
	"strings"
	"testing"
	"unicode/utf8"
)

func TestScrubText(t *testing.T) {
	tests := []struct{ name, in, want string }{
		{"query e fragmento saem", "falhou em https://x.com/a?token=1#y agora", "falhou em https://x.com/a agora"},
		{"query sai mas a linha e coluna ficam", "at f (https://x/a.js?v=9:1:2)", "at f (https://x/a.js:1:2)"},
		{"bearer", "header Authorization: Bearer abc.def-123", "header Authorization: Bearer <token>"},
		{"jwt", "token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJh inválido", "token <token> inválido"},
		{"hex longo", "hash 9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08 errado", "hash <token> errado"},
		{"nome comprido sem dígito não é token", "ServerChannelListContextMenuProvider quebrou", "ServerChannelListContextMenuProvider quebrou"},
		{"email", "conta ana.maria+x@exemplo.com.br não existe", "conta <email> não existe"},
		{"quadro do hermes não é email", "render@index.android.bundle:1:234", "render@index.android.bundle:1:234"},
		{"uuid", "canal 123e4567-e89b-12d3-a456-426614174000 sumiu", "canal <id> sumiu"},
		{"windows com espaço no nome", `at f (C:\Users\Ana Maria\AppData\Local\x.js:1:2)`, `at f (C:\Users\<user>\AppData\Local\x.js:1:2)`},
		{"windows com barra normal", "C:/Users/joao/Desktop/a.txt", "C:/Users/<user>/Desktop/a.txt"},
		{"linux", "open /home/nicolas/.config/salinha/x.json", "open /home/<user>/.config/salinha/x.json"},
		{"mac", "/Users/bia/Library/x", "/Users/<user>/Library/x"},
		{"file url", "file:///C:/Users/x/AppData/app.asar/out/renderer/assets/index-abc.js:1:2", "file:///C:/Users/<user>/AppData/app.asar/out/renderer/assets/index-abc.js:1:2"},
		{"aspas longas", `Unexpected token in "isto é um texto digitado bem comprido"`, `Unexpected token in "…"`},
		{"aspas simples longas", `reading 'uma propriedade com nome enorme mesmo'`, `reading "…"`},
		{"crase longa", "msg `um template literal comprido demais aqui`", "msg \"…\""},
		{"aspas curtas ficam", `reading 'id'`, `reading 'id'`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := scrubText(tt.in)
			if got != tt.want {
				t.Errorf("scrubText(%q)\n got %q\nwant %q", tt.in, got, tt.want)
			}
			if again := scrubText(got); again != got {
				t.Errorf("limpar de novo mudou: %q → %q", got, again)
			}
		})
	}
}

func TestScrubMessageUmaLinhaAte300Bytes(t *testing.T) {
	if got := scrubMessage("  primeira\n  segunda\r\n\tterceira  "); got != "primeira segunda terceira" {
		t.Errorf("multilinha = %q", got)
	}
	long := strings.Repeat("é", 200) // 400 bytes
	got := scrubMessage(long)
	if len(got) > maxMessage || !utf8.ValidString(got) {
		t.Errorf("corte: %d bytes, válido=%v", len(got), utf8.ValidString(got))
	}
	if len(got) != 300 {
		t.Errorf("corte = %d bytes, quer 300 (150 é)", len(got))
	}
}

func TestScrubStack(t *testing.T) {
	in := "TypeError: x\n" +
		"    at Xy (https://app.salinha.com/assets/index-abc.js:1:2)\n" +
		"    at file:///C:/Users/Ana/AppData/Local/Programs/salinha/resources/app.asar/out/renderer/assets/x.js:3:4\n" +
		"\n" +
		"    at Zq (http://localhost:5173/src/a.tsx?t=171:5:6)\r\n"
	want := "TypeError: x\n" +
		"    at Xy (assets/index-abc.js:1:2)\n" +
		"    at out/renderer/assets/x.js:3:4\n" +
		"    at Zq (src/a.tsx:5:6)"
	if got := scrubStack(in); got != want {
		t.Errorf("scrubStack\n got %q\nwant %q", got, want)
	}
}

func TestScrubStackLimites(t *testing.T) {
	lines := make([]string, 50)
	for i := range lines {
		lines[i] = "    at f (assets/x.js:1:2)"
	}
	if got := strings.Count(scrubStack(strings.Join(lines, "\n")), "\n") + 1; got != maxStackLines {
		t.Errorf("linhas = %d, quer %d", got, maxStackLines)
	}
	big := strings.Repeat(strings.Repeat("ã", 100)+"\n", 30)
	got := scrubStack(big)
	if len(got) > maxStackBytes || !utf8.ValidString(got) {
		t.Errorf("pilha com %d bytes (válida=%v), teto %d", len(got), utf8.ValidString(got), maxStackBytes)
	}
	if strings.HasSuffix(got, "\n") || strings.Count(got, "\n") != 19 {
		t.Errorf("corte devia parar numa linha inteira: %d quebras", strings.Count(got, "\n"))
	}
	one := scrubStack(strings.Repeat("ç", 3000))
	if len(one) > maxStackBytes || !utf8.ValidString(one) {
		t.Errorf("linha única gigante: %d bytes, válida=%v", len(one), utf8.ValidString(one))
	}
}
