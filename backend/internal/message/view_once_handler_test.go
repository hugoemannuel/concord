package message

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
)

type fakeOpener struct {
	err            error
	gotID, gotUser string
}

func (f *fakeOpener) Open(_ context.Context, attachmentID, userID string) (string, time.Time, error) {
	f.gotID, f.gotUser = attachmentID, userID
	if f.err != nil {
		return "", time.Time{}, f.err
	}
	return "tok", time.Date(2026, 11, 12, 10, 0, 0, 0, time.UTC), nil
}

const openID = "6f1c2a4e-8d3b-4c5a-9e7f-1a2b3c4d5e6f"

func postOpen(t *testing.T, opener *fakeOpener) *httptest.ResponseRecorder {
	t.Helper()
	return postOpenID(t, opener, openID)
}

func postOpenID(t *testing.T, opener *fakeOpener, id string) *httptest.ResponseRecorder {
	t.Helper()
	gin.SetMode(gin.TestMode)
	r := gin.New()
	auth := func(c *gin.Context) { c.Set("userID", "u1"); c.Next() }
	ViewOnceRoutes(r.Group("/api"), NewViewOnceHandler(opener), auth)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/attachments/"+id+"/open", nil))
	return rec
}

func TestOpenHandlerDevolveToken(t *testing.T) {
	opener := &fakeOpener{}
	rec := postOpen(t, opener)
	if rec.Code != http.StatusOK || opener.gotID != openID || opener.gotUser != "u1" {
		t.Fatalf("status %d body %s", rec.Code, rec.Body)
	}
	var body struct {
		Token     string `json:"token"`
		ExpiresAt string `json:"expires_at"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil || body.Token != "tok" || body.ExpiresAt != "2026-11-12T10:00:00Z" {
		t.Fatalf("corpo %s (%v)", rec.Body, err)
	}
}

func TestOpenHandlerTraduzErros(t *testing.T) {
	cases := []struct {
		err    error
		status int
	}{
		{ErrViewOnceForbidden, http.StatusForbidden},
		{ErrViewOnceGone, http.StatusGone},
		{ErrAttachmentNotFound, http.StatusNotFound},
		{ErrNoRoomAccess, http.StatusNotFound},
		{ErrRoomNotFound, http.StatusNotFound},
		{errors.New("pq: segredo do banco"), http.StatusInternalServerError},
	}
	for _, c := range cases {
		rec := postOpen(t, &fakeOpener{err: c.err})
		if rec.Code != c.status || strings.Contains(rec.Body.String(), "segredo") {
			t.Errorf("%v: status %d body %s", c.err, rec.Code, rec.Body)
		}
	}
}

// Id que não é UUID: 404 antes de chegar ao banco (o Postgres daria 500).
func TestOpenHandlerIdInvalidoDa404(t *testing.T) {
	opener := &fakeOpener{}
	rec := postOpenID(t, opener, "nao-e-uuid")
	if rec.Code != http.StatusNotFound || opener.gotID != "" {
		t.Fatalf("status %d, chamou o serviço com %q", rec.Code, opener.gotID)
	}
}
