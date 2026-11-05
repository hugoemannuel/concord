package audit

import "testing"

func TestAcoesDeEdicaoDeExpressoes(t *testing.T) {
	for _, action := range []Action{"emoji.update", "sticker.update", "sound.update"} {
		t.Run(string(action), func(t *testing.T) {
			if !ValidAction(action) {
				t.Fatalf("ação de edição não aceita: %s", action)
			}
		})
	}
}
