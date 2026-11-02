package channel

import (
	"encoding/json"
	"net/http"
	"testing"
)

func TestCreateReceivesCategory(t *testing.T) {
	for _, kind := range []string{TypeText, TypeVoice} {
		t.Run(kind, func(t *testing.T) {
			store := newPermStore()
			response := doRequest(t, store, &permPublisher{}, "dono", http.MethodPost, "/servers/s1/channels", `{"name":"novo","type":"`+kind+`","category_id":"jogos"}`)
			if response.Code != http.StatusCreated {
				t.Fatalf("status %d: %s", response.Code, response.Body.String())
			}
			var created Channel
			if err := json.Unmarshal(response.Body.Bytes(), &created); err != nil {
				t.Fatal(err)
			}
			if created.CategoryID == nil || *created.CategoryID != "jogos" {
				t.Fatalf("categoria: %v", created.CategoryID)
			}
		})
	}
}
