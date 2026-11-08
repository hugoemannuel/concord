package push

import (
	"reflect"
	"strings"
	"testing"
)

func TestMentionedUsernames(t *testing.T) {
	cases := []struct {
		name    string
		content string
		want    []string
	}{
		{"menção simples", "oi @ana_mobile tudo bem?", []string{"ana_mobile"}},
		{"no começo e com pontuação", "@Bia_Web, olha isso! (@caio_dev)", []string{"bia_web", "caio_dev"}},
		{"sem repetir", "@ana_mobile @ANA_MOBILE de novo", []string{"ana_mobile"}},
		{"e-mail não é menção", "fala com ana@exemplo.com", nil},
		{"link não é menção", "veja x.com/@ana_mobile", nil},
		{"@all e @here não são usuários", "@all @here @everyone @ana_mobile", []string{"ana_mobile"}},
		{"nome curto demais não vale", "oi @ab", nil},
		{"sem menção", "mensagem comum", nil},
		{"vazio", "", nil},
		{"dentro de código não pinga", "`@ana_mobile` e ```\n@bia_web\n``` mas @caio_dev", []string{"caio_dev"}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := MentionedUsernames(c.content); !reflect.DeepEqual(got, c.want) {
				t.Fatalf("MentionedUsernames(%q) = %v, esperava %v", c.content, got, c.want)
			}
		})
	}
}

func TestPreview(t *testing.T) {
	if got := Preview("  olá  ", false); got != "olá" {
		t.Fatalf("aparar espaços: %q", got)
	}
	if got := Preview("", true); got != "Enviou um anexo" {
		t.Fatalf("só anexo: %q", got)
	}
	if got := Preview("", false); got != "" {
		t.Fatalf("vazio sem anexo: %q", got)
	}
	long := strings.Repeat("ã", 150)
	got := Preview(long, false)
	if r := []rune(got); len(r) != 101 || string(r[100]) != "…" {
		t.Fatalf("truncar em 100 caracteres (não bytes) + reticências: %d runas", len(r))
	}
	if got := Preview(strings.Repeat("a", 100), false); strings.HasSuffix(got, "…") {
		t.Fatalf("exatos 100 não ganham reticências")
	}
}
