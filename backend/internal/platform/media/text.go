package media

import (
	"bytes"
	"unicode/utf8"
)

// SniffText diz se o começo do arquivo é texto: UTF-8 válido e sem byte
// nulo. Uma runa cortada no fim é aceita (head é só o começo do arquivo).
// Quem decide são os bytes: binário renomeado para .txt não passa.
func SniffText(head []byte) bool {
	if len(head) == 0 || bytes.IndexByte(head, 0) >= 0 {
		return false
	}
	for len(head) > 0 {
		r, size := utf8.DecodeRune(head)
		if r == utf8.RuneError && size == 1 {
			// Inválido, a não ser que seja o começo de uma runa cortada no fim.
			return !utf8.FullRune(head)
		}
		head = head[size:]
	}
	return true
}
