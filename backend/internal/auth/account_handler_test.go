package auth

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"

	"gin-quickstart/backend/internal/user"
)

type fakeAccountUsers struct {
	u   *user.User
	err error
}

func (f *fakeAccountUsers) FindByID(context.Context, string) (*user.User, error) {
	return f.u, f.err
}

type fakeAccountChanges struct {
	username, email string
	err             error
	confirm         bool
}

func (f *fakeAccountChanges) ChangeUsername(_ context.Context, _ string, username string) (*user.User, error) {
	if f.err != nil {
		return nil, f.err
	}
	f.username = username
	return &user.User{ID: "u1", Username: username, Email: "ana@x.com"}, nil
}

func (f *fakeAccountChanges) ChangeEmail(_ context.Context, _ string, email string) (*user.User, bool, error) {
	if f.err != nil {
		return nil, false, f.err
	}
	f.email = email
	return &user.User{ID: "u1", Username: "ana", Email: email}, f.confirm, nil
}

type fakeVerifier struct{ sentTo []string }

func (f *fakeVerifier) SendNewAddressVerification(_ context.Context, u *user.User) error {
	f.sentTo = append(f.sentTo, u.Email)
	return nil
}

type accountEnv struct {
	h        *AccountHandler
	changes  *fakeAccountChanges
	verifier *fakeVerifier
}

// A senha certa é "senha-certa" (o compare do teste não usa bcrypt).
func newAccountEnv() *accountEnv {
	e := &accountEnv{changes: &fakeAccountChanges{}, verifier: &fakeVerifier{}}
	auth := AuthHandler(nil, nil)
	auth.compareHash = func(hash, password []byte) error {
		if string(password) != "senha-certa" {
			return errors.New("senha errada")
		}
		return nil
	}
	users := &fakeAccountUsers{u: &user.User{ID: "u1", Username: "ana", Email: "ana@x.com", PasswordHash: "h"}}
	e.h = NewAccountHandler(auth, users, e.changes)
	e.h.verify = e.verifier
	return e
}

func (e *accountEnv) put(handler gin.HandlerFunc, body, userID string) *httptest.ResponseRecorder {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.PUT("/x", func(c *gin.Context) {
		if userID != "" {
			c.Set("userID", userID)
		}
	}, handler)
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPut, "/x", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)
	return w
}

func TestChangeUsernameHandler(t *testing.T) {
	tests := []struct {
		name     string
		body     string
		userID   string
		err      error
		want     int
		wantBody string
	}{
		{"senha certa troca", `{"username":"ana_2","password":"senha-certa"}`, "u1", nil, http.StatusOK, `"username":"ana_2"`},
		{"senha errada", `{"username":"ana_2","password":"x"}`, "u1", nil, http.StatusForbidden, "wrong_password"},
		{"senha longa demais nem compara", `{"username":"ana_2","password":"` + strings.Repeat("a", 80) + `"}`, "u1", nil, http.StatusForbidden, "wrong_password"},
		{"sem login", `{"username":"ana_2","password":"senha-certa"}`, "", nil, http.StatusUnauthorized, "unauthorized"},
		{"corpo inválido", `{`, "u1", nil, http.StatusBadRequest, "invalid request"},
		{"já em uso", `{"username":"bruno","password":"senha-certa"}`, "u1", user.ErrUsernameTaken, http.StatusConflict, "já está em uso"},
		{"reservado", `{"username":"all","password":"senha-certa"}`, "u1", user.ErrUsernameReserved, http.StatusBadRequest, "reservado"},
		{"formato inválido", `{"username":"a b","password":"senha-certa"}`, "u1", user.ErrInvalidUsername, http.StatusBadRequest, "username"},
		{"erro interno", `{"username":"ana_2","password":"senha-certa"}`, "u1", errors.New("banco caiu"), http.StatusInternalServerError, "failed to update account"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			e := newAccountEnv()
			e.changes.err = tt.err
			w := e.put(e.h.ChangeUsername, tt.body, tt.userID)
			if w.Code != tt.want || !strings.Contains(w.Body.String(), tt.wantBody) {
				t.Errorf("status = %d body = %s; quer %d com %q", w.Code, w.Body.String(), tt.want, tt.wantBody)
			}
		})
	}
}

func TestChangeUsernameNaoMostraOEmailDeOutros(t *testing.T) {
	e := newAccountEnv()
	w := e.put(e.h.ChangeUsername, `{"username":"ana_2","password":"senha-certa"}`, "u1")
	// A resposta é a própria conta (Self): com o e-mail.
	if !strings.Contains(w.Body.String(), `"email":"ana@x.com"`) {
		t.Errorf("body = %s, quer o e-mail da própria conta", w.Body.String())
	}
}

func TestChangeEmailHandler(t *testing.T) {
	tests := []struct {
		name     string
		body     string
		confirm  bool
		err      error
		want     int
		wantSent int
	}{
		{"e-mail novo manda o link", `{"email":"nova@x.com","password":"senha-certa"}`, true, nil, http.StatusOK, 1},
		{"só a caixa não manda link", `{"email":"ANA@x.com","password":"senha-certa"}`, false, nil, http.StatusOK, 0},
		{"senha errada", `{"email":"nova@x.com","password":"errada"}`, false, nil, http.StatusForbidden, 0},
		{"já em uso", `{"email":"bruno@x.com","password":"senha-certa"}`, false, user.ErrEmailTaken, http.StatusConflict, 0},
		{"formato inválido", `{"email":"x","password":"senha-certa"}`, false, user.ErrInvalidEmail, http.StatusBadRequest, 0},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			e := newAccountEnv()
			e.changes.err = tt.err
			e.changes.confirm = tt.confirm
			w := e.put(e.h.ChangeEmail, tt.body, "u1")
			if w.Code != tt.want {
				t.Errorf("status = %d body = %s; quer %d", w.Code, w.Body.String(), tt.want)
			}
			if len(e.verifier.sentTo) != tt.wantSent {
				t.Errorf("links enviados = %v, quer %d", e.verifier.sentTo, tt.wantSent)
			}
		})
	}
}

func TestChangeEmailSemServicoDeEmailNaoQuebra(t *testing.T) {
	e := newAccountEnv()
	e.h.verify = nil
	e.changes.confirm = true
	if w := e.put(e.h.ChangeEmail, `{"email":"nova@x.com","password":"senha-certa"}`, "u1"); w.Code != http.StatusOK {
		t.Fatalf("status = %d, quer 200", w.Code)
	}
}

func TestAccountPasswordAttemptsAreLimited(t *testing.T) {
	e := newAccountEnv()
	for i := 0; i < accountPasswordFailures; i++ {
		if w := e.put(e.h.ChangeUsername, `{"username":"ana_2","password":"x"}`, "u1"); w.Code != http.StatusForbidden {
			t.Fatalf("tentativa %d: status = %d, quer 403", i+1, w.Code)
		}
	}
	// Esgotou: nem a senha certa passa até a janela acabar.
	w := e.put(e.h.ChangeUsername, `{"username":"ana_2","password":"senha-certa"}`, "u1")
	if w.Code != http.StatusTooManyRequests || w.Header().Get("Retry-After") == "" {
		t.Fatalf("status = %d Retry-After = %q, quer 429 com Retry-After", w.Code, w.Header().Get("Retry-After"))
	}
}

func TestAccountRightPasswordResetsAttempts(t *testing.T) {
	e := newAccountEnv()
	for i := 0; i < accountPasswordFailures-1; i++ {
		e.put(e.h.ChangeUsername, `{"username":"ana_2","password":"x"}`, "u1")
	}
	e.put(e.h.ChangeUsername, `{"username":"ana_2","password":"senha-certa"}`, "u1")
	if w := e.put(e.h.ChangeUsername, `{"username":"ana_3","password":"x"}`, "u1"); w.Code != http.StatusForbidden {
		t.Fatalf("depois de acertar, errar de novo = %d, quer 403 (não 429)", w.Code)
	}
}

func TestAccountLookupFailureDoesNotCountAttempt(t *testing.T) {
	e := newAccountEnv()
	e.h.users = &fakeAccountUsers{err: errors.New("banco caiu")}
	for i := 0; i < accountPasswordFailures+1; i++ {
		if w := e.put(e.h.ChangeUsername, `{"username":"ana_2","password":"x"}`, "u1"); w.Code != http.StatusInternalServerError {
			t.Fatalf("status = %d, quer 500", w.Code)
		}
	}
}

func TestAccountNoBcryptSlotIs429(t *testing.T) {
	e := newAccountEnv()
	e.h.guard = newLoginGuard()
	e.h.guard.bcryptSlots = make(chan struct{}) // nenhuma vaga
	e.h.guard.bcryptWait = 0
	w := e.put(e.h.ChangeUsername, `{"username":"ana_2","password":"senha-certa"}`, "u1")
	if w.Code != http.StatusTooManyRequests {
		t.Fatalf("status = %d, quer 429", w.Code)
	}
}

func TestChangeUsernameNoPrazoDiz429ComAData(t *testing.T) {
	e := newAccountEnv()
	until := time.Date(2026, 11, 3, 12, 0, 0, 0, time.UTC)
	e.changes.err = &user.UsernameCooldownError{Until: until}
	w := e.put(e.h.ChangeUsername, `{"username":"ana_2","password":"senha-certa"}`, "u1")
	body := w.Body.String()
	if w.Code != http.StatusTooManyRequests {
		t.Fatalf("status = %d body = %s, quer 429", w.Code, body)
	}
	for _, want := range []string{`"code":"username_cooldown"`, `"available_at":"2026-11-03T12:00:00Z"`} {
		if !strings.Contains(body, want) {
			t.Errorf("body = %s, quer %s", body, want)
		}
	}
}
