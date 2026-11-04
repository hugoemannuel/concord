package channel

import (
	"encoding/json"
	"net/http"
	"testing"

	"gin-quickstart/backend/internal/permission"
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

func TestCreateRefusesCategoryTheMemberCannotSee(t *testing.T) {
	if !hiddenCategory(categorySnapshot(), strPtr("secreta"), "ana") {
		t.Fatal("ana criaria canal numa categoria que não vê")
	}
	for _, category := range []*string{nil, strPtr("aberta"), strPtr("desconhecida")} {
		if hiddenCategory(categorySnapshot(), category, "ana") {
			t.Fatalf("recusou %v", category)
		}
	}
	if hiddenCategory(categorySnapshot(), strPtr("secreta"), "dono") {
		t.Fatal("o dono vê toda categoria")
	}
}

func categorySnapshot() *permission.Snapshot {
	return permission.NewSnapshot("s1", "dono", permission.DefaultEveryone).
		WithMember("dono").WithMember("ana").
		WithCategory("aberta").
		WithCategory("secreta", permission.Overwrite{TargetType: permission.TargetRole, TargetID: "everyone", Deny: permission.ViewChannel})
}

func strPtr(value string) *string { return &value }

func TestCreateRefusesBadRequests(t *testing.T) {
	for _, tc := range []struct {
		name, body string
		status     int
	}{
		{"corpo inválido", `{`, http.StatusBadRequest},
		{"tipo inválido", `{"name":"x","type":"forum"}`, http.StatusBadRequest},
		{"cargo de fora no canal privado", `{"name":"x","private":true,"role_ids":["de-fora"]}`, http.StatusBadRequest},
		{"sem nome", `{"type":"text"}`, http.StatusBadRequest},
	} {
		t.Run(tc.name, func(t *testing.T) {
			response := doRequest(t, newPermStore(), &permPublisher{}, "dono", http.MethodPost, "/servers/s1/channels", tc.body)
			if response.Code != tc.status {
				t.Fatalf("status %d: %s", response.Code, response.Body.String())
			}
		})
	}
}
