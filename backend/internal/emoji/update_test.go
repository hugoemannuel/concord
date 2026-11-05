package emoji

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

func (m *mockRepo) Update(ctx context.Context, serverID, id, name string) (*Emoji, error) {
	found, err := m.FindByID(ctx, id)
	if err != nil {
		return nil, err
	}
	if found.ServerID != serverID {
		return nil, ErrEmojiNotFound
	}
	for _, other := range m.emojis {
		if other.ID != id && other.ServerID == serverID && strings.EqualFold(other.Name, name) {
			return nil, ErrNameTaken
		}
	}
	s := *found
	s.Name = name

	m.emojis[id] = &s
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
	req := httptest.NewRequest(http.MethodPatch, "/api/servers/"+serverID+"/emojis/"+id, strings.NewReader(body))
	req.Header.Set("X-User", user)
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
		{"remetente", "ana", "srv-1", "item", `{"name":"novo"}`, 200, ""},
		{"gerencia expressões", "mod", "srv-1", "item", `{"name":"novo"}`, 200, ""},
		{"sem permissão", "bia", "srv-1", "item", `{"name":"novo"}`, 403, ErrCannotEditEmoji.Error()},
		{"fora do servidor", "fora", "srv-1", "item", `{"name":"novo"}`, 403, ErrCannotEditEmoji.Error()},
		{"outro servidor", "mod", "srv-2", "item", `{"name":"novo"}`, 404, ErrEmojiNotFound.Error()},
		{"inexistente", "mod", "srv-1", "ausente", `{"name":"novo"}`, 404, ErrEmojiNotFound.Error()},
		{"JSON inválido", "ana", "srv-1", "item", `{`, 400, ""},
		{"tipo inválido", "ana", "srv-1", "item", `{"name":17}`, 400, ""},
		{"nome ausente", "ana", "srv-1", "item", `{}`, 400, ErrInvalidName.Error()},
		{"nome vazio", "ana", "srv-1", "item", `{"name":""}`, 400, ErrInvalidName.Error()},
		{"nome longo", "ana", "srv-1", "item", `{"name":"` + strings.Repeat("a", 33) + `"}`, 400, ErrInvalidName.Error()},
	}
	for _, tt := range tests {
		t.Run(tt.nome, func(t *testing.T) {
			e := newEnv(t)
			r, h, repo := e.router, e.h, e.repo
			original := Emoji{ID: "item", ServerID: "srv-1", UploaderID: "ana", Name: "antigo"}
			repo.emojis["item"] = &original
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
				if repo.emojis["item"].Name != "antigo" {
					t.Fatal("falha alterou o nome")
				}
			}
		})
	}
}

func TestUpdateRespostaEventoEAuditoria(t *testing.T) {
	for _, user := range []string{"ana", "mod"} {
		t.Run(user, func(t *testing.T) {
			e := newEnv(t)
			r, h, repo := e.router, e.h, e.repo
			original := Emoji{ID: "item", ServerID: "srv-1", UploaderID: "ana", Name: "antigo", ContentType: "image/png", SizeBytes: 10}
			repo.emojis["item"] = &original
			pub := &updatePublisher{}
			h.publisher = pub
			rec := &audittest.Recorder{}
			h.SetAudit(rec)
			w := patchExpression(r, user, "srv-1", "item", `{"name":"novo"}`)
			if w.Code != 200 {
				t.Fatalf("status = %d: %s", w.Code, w.Body.String())
			}
			expected := original
			expected.Name = "novo"

			var got Emoji
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
			if pub.count != 1 || pub.room != "server:srv-1" || event.Type != "emoji:updated" {
				t.Fatalf("publicação = %+v, evento %+v", pub, event)
			}
			if !reflect.DeepEqual(event.Payload, UpdatedEvent{ServerID: "srv-1", Emoji: expected}) {
				t.Fatalf("payload = %+v", event.Payload)
			}
			want := audit.Event{ServerID: "srv-1", ActorID: user, Action: audit.EmojiUpdate, TargetType: audit.TargetEmoji, TargetID: "item", TargetName: "novo", Changes: []audit.Change{{Field: "name", Before: "antigo", After: "novo"}}}
			if events := rec.Events(); !reflect.DeepEqual(events, []audit.Event{want}) {
				t.Fatalf("auditoria = %+v, esperado %+v", events, want)
			}
		})
	}
}

type updateErrorRepo struct {
	*mockRepo
	findErr, updateErr error
}

func (m *updateErrorRepo) FindByID(ctx context.Context, id string) (*Emoji, error) {
	if m.findErr != nil {
		return nil, m.findErr
	}
	return m.mockRepo.FindByID(ctx, id)
}
func (m *updateErrorRepo) Update(ctx context.Context, serverID, id, name string) (*Emoji, error) {
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
		{nome: "removido durante edição", updateErr: ErrEmojiNotFound, status: 404},
		{nome: "nome duplicado", updateErr: ErrNameTaken, status: 409},
	}
	for _, tt := range tests {
		t.Run(tt.nome, func(t *testing.T) {
			e := newEnv(t)
			r, h, repo := e.router, e.h, e.repo
			original := Emoji{ID: "item", ServerID: "srv-1", UploaderID: "ana", Name: "antigo"}
			repo.emojis["item"] = &original
			h.repo = &updateErrorRepo{mockRepo: repo, findErr: tt.findErr, updateErr: tt.updateErr}
			if tt.permissions {
				h.permissions = updateErrorPermissions{}
			}
			pub := &updatePublisher{}
			h.publisher = pub
			rec := &audittest.Recorder{}
			h.SetAudit(rec)
			w := patchExpression(r, "mod", "srv-1", "item", `{"name":"novo"}`)
			if w.Code != tt.status {
				t.Fatalf("status = %d, esperado %d: %s", w.Code, tt.status, w.Body.String())
			}
			if pub.count != 0 || len(rec.Events()) != 0 {
				t.Fatal("falha publicou evento ou auditoria")
			}
		})
	}
}
