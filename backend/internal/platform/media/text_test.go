package media

import (
	"bytes"
	"testing"
)

func TestSniffText(t *testing.T) {
	acento := []byte("ação")
	// "ã" ocupa 2 bytes: cortar no meio deixa uma runa incompleta no fim.
	cortado := append(bytes.Repeat([]byte("a"), 510), "ã"[0])
	cases := []struct {
		name string
		head []byte
		want bool
	}{
		{"markdown", []byte("# Título\n\nTexto com acento: ação.\n"), true},
		{"utf-8 com acento", acento, true},
		{"runa cortada no fim dos 512 bytes", cortado, true},
		{"byte nulo é binário", []byte("PK\x03\x04\x00\x00"), false},
		{"utf-8 inválido no meio", []byte("abc\xff\xfedef"), false},
		{"vazio não é texto", nil, false},
	}
	for _, tc := range cases {
		if got := SniffText(tc.head); got != tc.want {
			t.Errorf("%s: SniffText = %v, quer %v", tc.name, got, tc.want)
		}
	}
}
