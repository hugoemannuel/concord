package soundboard

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"

	"gin-quickstart/backend/internal/audit"
	"gin-quickstart/backend/internal/audit/audittest"

	"github.com/gin-gonic/gin"
)

func (m *fakeRepo) Update(ctx context.Context, serverID, id, name string, emoji *string) (*Sound, error) {
	found, err := m.FindByID(ctx, id)
	if err != nil {
		return nil, err
	}
	if found.ServerID != serverID {
		return nil, ErrSoundNotFound
	}

	s := *found
	s.Name = name
	s.Emoji = emoji
	m.sounds[id] = s
	return &s, nil
}

type updatePublisher struct {
	room  string
	raw   []byte
	count int
}

func (p *updatePublisher) BroadcastToRoom(room string, raw []byte) {
	p.room = room
	p.raw = raw
	p.count++
}

func patchExpression(r *gin.Engine, user, serverID, id, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodPatch, "/api/servers/"+serverID+"/soundboard/"+id, strings.NewReader(body))
	req.Header.Set("X-User-ID", user)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

func TestUpdateValidacaoEPermissao(t *testing.T) {
	tests := []struct {
		nome, user, serverID, id, body string
		status                         int
		erro                           string
	}{
		{"sem autenticação", "", "srv-1", "item", `{"name":"novo"}`, 401, ""},
		{"remetente", "user-1", "srv-1", "item", `{"name":"novo"}`, 200, ""},
		{"gerencia expressões", "mod-1", "srv-1", "item", `{"name":"novo"}`, 200, ""},
		{"sem permissão", "user-2", "srv-1", "item", `{"name":"novo"}`, 403, ErrCannotEditSound.Error()},
		{"fora do servidor", "fora", "srv-1", "item", `{"name":"novo"}`, 403, ErrCannotEditSound.Error()},
		{"outro servidor", "mod-1", "srv-2", "item", `{"name":"novo"}`, 404, ErrSoundNotFound.Error()},
		{"inexistente", "mod-1", "srv-1", "ausente", `{"name":"novo"}`, 404, ErrSoundNotFound.Error()},
		{"JSON inválido", "user-1", "srv-1", "item", `{`, 400, ""},
		{"tipo inválido", "user-1", "srv-1", "item", `{"name":17}`, 400, ""},
		{"nome ausente", "user-1", "srv-1", "item", `{}`, 400, ErrInvalidName.Error()},
		{"nome vazio", "user-1", "srv-1", "item", `{"name":""}`, 400, ErrInvalidName.Error()},
		{"nome longo", "user-1", "srv-1", "item", `{"name":"` + strings.Repeat("a", 33) + `"}`, 400, ErrInvalidName.Error()},
	}
	for _, tt := range tests {
		t.Run(tt.nome, func(t *testing.T) {
			r, h, repo, _ := setupTestRouter(t)
			original := Sound{ID: "item", ServerID: "srv-1", UploaderID: "user-1", Name: "antigo"}
			repo.sounds["item"] = original
			pub := &updatePublisher{}
			h.publisher = pub
			rec := &audittest.Recorder{}
			h.SetAudit(rec)
			w := patchExpression(r, tt.user, tt.serverID, tt.id, tt.body)
			if w.Code != tt.status {
				t.Fatalf("status = %d, esperado %d: %s", w.Code, tt.status, w.Body.String())
			}
			if tt.erro != "" {
				var response struct {
					Error string `json:"error"`
				}
				_ = json.Unmarshal(w.Body.Bytes(), &response)
				if response.Error != tt.erro {
					t.Fatalf("erro = %q, esperado %q", response.Error, tt.erro)
				}
			}
			if tt.status != 200 {
				if pub.count != 0 || len(rec.Events()) != 0 {
					t.Fatal("falha publicou evento ou auditoria")
				}
				if repo.sounds["item"].Name != "antigo" {
					t.Fatal("falha alterou o nome")
				}
			}
		})
	}
}

func TestUpdateRespostaEventoEAuditoria(t *testing.T) {
	for _, user := range []string{"user-1", "mod-1"} {
		t.Run(user, func(t *testing.T) {
			r, h, repo, _ := setupTestRouter(t)
			original := Sound{ID: "item", ServerID: "srv-1", UploaderID: "user-1", Name: "antigo", ContentType: "audio/wav", SizeBytes: 10, UploaderName: "Ana", DurationMs: 1000}
			repo.sounds["item"] = original
			pub := &updatePublisher{}
			h.publisher = pub
			rec := &audittest.Recorder{}
			h.SetAudit(rec)
			w := patchExpression(r, user, "srv-1", "item", `{"name":" novo\n ","emoji":" 🔥 "}`)
			if w.Code != 200 {
				t.Fatalf("status = %d: %s", w.Code, w.Body.String())
			}
			expected := original
			expected.Name = "novo"
			emoji := "🔥"
			expected.Emoji = &emoji
			var got Sound
			if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil {
				t.Fatal(err)
			}
			if !reflect.DeepEqual(got, expected) {
				t.Fatalf("resposta = %+v, esperado %+v", got, expected)
			}
			var event struct {
				Type    string       `json:"type"`
				Payload UpdatedEvent `json:"payload"`
			}
			if err := json.Unmarshal(pub.raw, &event); err != nil {
				t.Fatal(err)
			}
			if pub.count != 1 || pub.room != "server:srv-1" || event.Type != "soundboard:updated" {
				t.Fatalf("publicação = %+v, evento %+v", pub, event)
			}
			if !reflect.DeepEqual(event.Payload, UpdatedEvent{ServerID: "srv-1", Sound: expected}) {
				t.Fatalf("payload = %+v", event.Payload)
			}
			want := audit.Event{ServerID: "srv-1", ActorID: user, Action: audit.SoundUpdate, TargetType: audit.TargetSound, TargetID: "item", TargetName: "novo", Changes: []audit.Change{{Field: "name", Before: "antigo", After: "novo"}, {Field: "emoji", After: "🔥"}}}
			if events := rec.Events(); !reflect.DeepEqual(events, []audit.Event{want}) {
				t.Fatalf("auditoria = %+v, esperado %+v", events, want)
			}
		})
	}
}

type updateErrorRepo struct {
	*fakeRepo
	findErr, updateErr error
}

func (m *updateErrorRepo) FindByID(ctx context.Context, id string) (*Sound, error) {
	if m.findErr != nil {
		return nil, m.findErr
	}
	return m.fakeRepo.FindByID(ctx, id)
}
func (m *updateErrorRepo) Update(ctx context.Context, serverID, id, name string, emoji *string) (*Sound, error) {
	return nil, m.updateErr
}

type updateErrorPermissions struct{}

func (updateErrorPermissions) ServerPerms(context.Context, string, string) (int64, error) {
	return 0, errors.New("falha de permissão")
}

func TestUpdateFalhasInternas(t *testing.T) {
	tests := []struct {
		nome               string
		findErr, updateErr error
		permissions        bool
		status             int
	}{
		{nome: "consulta", findErr: errors.New("consulta"), status: 500},
		{nome: "permissões", permissions: true, status: 500},
		{nome: "gravação", updateErr: errors.New("gravação"), status: 500},
		{nome: "removido durante edição", updateErr: ErrSoundNotFound, status: 404},
	}
	for _, tt := range tests {
		t.Run(tt.nome, func(t *testing.T) {
			r, h, repo, _ := setupTestRouter(t)
			original := Sound{ID: "item", ServerID: "srv-1", UploaderID: "user-1", Name: "antigo"}
			repo.sounds["item"] = original
			h.repo = &updateErrorRepo{fakeRepo: repo, findErr: tt.findErr, updateErr: tt.updateErr}
			if tt.permissions {
				h.permissions = updateErrorPermissions{}
			}
			pub := &updatePublisher{}
			h.publisher = pub
			rec := &audittest.Recorder{}
			h.SetAudit(rec)
			w := patchExpression(r, "mod-1", "srv-1", "item", `{"name":"novo"}`)
			if w.Code != tt.status {
				t.Fatalf("status = %d, esperado %d: %s", w.Code, tt.status, w.Body.String())
			}
			if pub.count != 0 || len(rec.Events()) != 0 {
				t.Fatal("falha publicou evento ou auditoria")
			}
		})
	}
}

func TestUpdateLimpaEmoji(t *testing.T) {
	for _, body := range []string{`{"name":"novo"}`, `{"name":"novo","emoji":""}`, `{"name":"novo","emoji":" \n "}`} {
		t.Run(body, func(t *testing.T) {
			r, h, repo, _ := setupTestRouter(t)
			emoji := "🔥"
			repo.sounds["item"] = Sound{ID: "item", ServerID: "srv-1", UploaderID: "user-1", UploaderName: "Ana", Name: "antigo", Emoji: &emoji}
			rec := &audittest.Recorder{}
			h.SetAudit(rec)
			w := patchExpression(r, "user-1", "srv-1", "item", body)
			if w.Code != 200 {
				t.Fatalf("status = %d: %s", w.Code, w.Body.String())
			}
			var got map[string]any
			if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil {
				t.Fatal(err)
			}
			if _, exists := got["emoji"]; exists {
				t.Fatalf("emoji deveria ser omitido: %+v", got)
			}
			if repo.sounds["item"].Emoji != nil {
				t.Fatal("emoji não foi limpo no repositório")
			}
			event, ok := rec.Last()
			if !ok {
				t.Fatal("auditoria ausente")
			}
			want := []audit.Change{{Field: "name", Before: "antigo", After: "novo"}, {Field: "emoji", Before: "🔥"}}
			if !reflect.DeepEqual(event.Changes, want) {
				t.Fatalf("mudanças = %+v, esperado %+v", event.Changes, want)
			}
		})
	}
}
