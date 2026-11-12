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

func postOpen(t *testing.T, opener *fakeOpener) *httptest.ResponseRecorder {
	t.Helper()
	gin.SetMode(gin.TestMode)
	r := gin.New()
	auth := func(c *gin.Context) { c.Set("userID", "u1"); c.Next() }
	ViewOnceRoutes(r.Group("/api"), NewViewOnceHandler(opener), auth)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/attachments/a1/open", nil))
	return rec
}

func TestOpenHandlerDevolveToken(t *testing.T) {
	opener := &fakeOpener{}
	rec := postOpen(t, opener)
	if rec.Code != http.StatusOK || opener.gotID != "a1" || opener.gotUser != "u1" {
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
