package message

import (
	"bytes"
	"errors"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestUploadSemUsuarioResponde401(t *testing.T) {
	env := newAttachmentEnv(t, fakeAccess{}, fakeSpace{ok: true})
	router := gin.New()
	AttachmentRoutes(router.Group("/api"), env.h, func(c *gin.Context) { c.Next() })
	body, ctype := multipartBody(t, nil, "a.png", "image/png", pngBytes(64))
	req := httptest.NewRequest(http.MethodPost, "/api/channels/ch1/attachments", body)
	req.Header.Set("Content-Type", ctype)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized || rec.Body.String() != `{"error":"unauthorized"}` {
		t.Fatalf("resposta = %d %s", rec.Code, rec.Body.String())
	}
}

func TestUploadRecusaCorpoInvalido(t *testing.T) {
	semArquivo := &bytes.Buffer{}
	w := multipart.NewWriter(semArquivo)
	w.WriteField("width", "10")
	w.Close()
	casos := map[string]struct {
		body  string
		ctype string
	}{
		"não é multipart":    {"{}", "application/json"},
		"sem arquivo":        {semArquivo.String(), w.FormDataContentType()},
		"multipart quebrado": {"--x\r\nlixo", "multipart/form-data; boundary=x"},
	}
	for nome, caso := range casos {
		t.Run(nome, func(t *testing.T) {
			env := newAttachmentEnv(t, fakeAccess{}, fakeSpace{ok: true})
			req := httptest.NewRequest(http.MethodPost, "/api/channels/ch1/attachments", strings.NewReader(caso.body))
			req.Header.Set("Content-Type", caso.ctype)
			rec := httptest.NewRecorder()
			env.router.ServeHTTP(rec, req)
			if rec.Code != http.StatusBadRequest || rec.Body.String() != `{"error":"invalid upload"}` {
				t.Fatalf("resposta = %d %s", rec.Code, rec.Body.String())
			}
			env.assertDiskEmpty(t)
		})
	}
}

func TestUploadFalhaAoGravarApagaArquivo(t *testing.T) {
	env := newAttachmentEnv(t, fakeAccess{}, fakeSpace{ok: true})
	env.repo.createErr = errors.New("banco fora")
	rec := env.upload(t, "/api/channels/ch1/attachments", nil, "a.png", "image/png", pngBytes(64))
	if rec.Code != http.StatusInternalServerError || rec.Body.String() != `{"error":"failed to save attachment"}` {
		t.Fatalf("resposta = %d %s", rec.Code, rec.Body.String())
	}
	env.assertDiskEmpty(t)
}
