package message

import (
	"bytes"
	"errors"
	"net/http"
	"testing"
)

// VerifyViewOnceToken dos testes: "vo:<id>" vale só para o anexo id.
func (fakeTokens) VerifyViewOnceToken(token, attachmentID string) (string, error) {
	if token == "vo:"+attachmentID {
		return "u1", nil
	}
	return "", errors.New("invalid token")
}

// storedViewOnce: o anexo do storedImage virado mensagem de visualização única na DM.
func (e *attachmentEnv) storedViewOnce(t *testing.T) (string, []byte) {
	t.Helper()
	messageID := "m1"
	id, data := e.storedImage(t, &messageID)
	conv := "dm1"
	row := e.repo.rows[id]
	row.ChannelID, row.ConversationID, row.ViewOnce = nil, &conv, true
	return id, data
}

// Foco de revisão 4: o token de mídia comum não abre a visualização única
// (app antigo); 404 como se não existisse.
func TestServeFileViewOnceRecusaTokenDeMidia(t *testing.T) {
	env := newAttachmentEnv(t, fakeAccess{}, fakeSpace{ok: true})
	id, _ := env.storedViewOnce(t)
	if rec := env.get("/api/media/"+id+"?token=bom", nil); rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d", rec.Code)
	}
}

func TestServeFileViewOnceRecusaTokenDeOutroAnexo(t *testing.T) {
	env := newAttachmentEnv(t, fakeAccess{}, fakeSpace{ok: true})
	id, _ := env.storedViewOnce(t)
	if rec := env.get("/api/media/"+id+"?token=vo:outro", nil); rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d", rec.Code)
	}
}

func TestServeFileViewOnceAceitaTokenCertoComRange(t *testing.T) {
	env := newAttachmentEnv(t, fakeAccess{}, fakeSpace{ok: true})
	id, data := env.storedViewOnce(t)
	rec := env.get("/api/media/"+id+"?token=vo:"+id, map[string]string{"Range": "bytes=0-3"})
	if rec.Code != http.StatusPartialContent || !bytes.Equal(rec.Body.Bytes(), data[:4]) {
		t.Fatalf("status = %d, corpo = %q", rec.Code, rec.Body.Bytes())
	}
	if got := rec.Header().Get("Cache-Control"); got != "no-store" {
		t.Fatalf("Cache-Control = %q", got)
	}
}

func TestServeFileViewOnceGoneDa404(t *testing.T) {
	env := newAttachmentEnv(t, fakeAccess{}, fakeSpace{ok: true})
	id, _ := env.storedViewOnce(t)
	env.repo.rows[id].ViewOnceGone = true
	if rec := env.get("/api/media/"+id+"?token=vo:"+id, nil); rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d", rec.Code)
	}
}

// O CanRead continua valendo com o token certo.
func TestServeFileViewOnceSemAcessoDa404(t *testing.T) {
	env := newAttachmentEnv(t, fakeAccess{readErr: ErrNoRoomAccess}, fakeSpace{ok: true})
	id, _ := env.storedViewOnce(t)
	if rec := env.get("/api/media/"+id+"?token=vo:"+id, nil); rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d", rec.Code)
	}
}
