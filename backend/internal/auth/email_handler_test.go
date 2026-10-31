package auth

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"

	"gin-quickstart/backend/internal/platform/mailer"
	"gin-quickstart/backend/internal/user"
)

type fakeTokens struct {
	byHash map[string]string // hash -> "purpose|userID"
	used   map[string]bool
}

func newFakeTokens() *fakeTokens {
	return &fakeTokens{byHash: map[string]string{}, used: map[string]bool{}}
}

// CreateEmailToken: como o banco, invalida os pendentes da mesma finalidade.
func (f *fakeTokens) CreateEmailToken(ctx context.Context, userID, purpose, hash string, expiresAt time.Time) error {
	for h, v := range f.byHash {
		if v == purpose+"|"+userID {
			f.used[h] = true
		}
	}
	return f.AddEmailToken(ctx, userID, purpose, hash, expiresAt)
}

// InvalidateEmailTokens: como o banco, todos os pendentes da conta.
func (f *fakeTokens) InvalidateEmailTokens(_ context.Context, userID string) error {
	for h, v := range f.byHash {
		if strings.HasSuffix(v, "|"+userID) {
			f.used[h] = true
		}
	}
	return nil
}

func (f *fakeTokens) AddEmailToken(_ context.Context, userID, purpose, hash string, _ time.Time) error {
	f.byHash[hash] = purpose + "|" + userID
	return nil
}

func (f *fakeTokens) EmailTokenOwner(_ context.Context, purpose, hash string) (string, error) {
	v, ok := f.byHash[hash]
	if !ok || !strings.HasPrefix(v, purpose+"|") {
		return "", ErrInvalidEmailToken
	}
	return strings.TrimPrefix(v, purpose+"|"), nil
}

func (f *fakeTokens) ConsumeEmailToken(_ context.Context, purpose, hash string) (string, error) {
	v, ok := f.byHash[hash]
	if !ok || f.used[hash] || !strings.HasPrefix(v, purpose+"|") {
		return "", ErrInvalidEmailToken
	}
	f.used[hash] = true
	return strings.TrimPrefix(v, purpose+"|"), nil
}

type fakeEmailUsers struct {
	u        *user.User
	verified bool
	password string
}

func (f *fakeEmailUsers) FindByID(context.Context, string) (*user.User, error) { return f.u, nil }
func (f *fakeEmailUsers) FindByEmailFold(_ context.Context, email string) (*user.User, error) {
	if f.u != nil && strings.EqualFold(f.u.Email, email) {
		return f.u, nil
	}
	return nil, pgx.ErrNoRows
}
func (f *fakeEmailUsers) MarkEmailVerified(context.Context, string) error {
	f.verified = true
	if f.u.EmailVerifiedAt == nil {
		now := time.Now()
		f.u.EmailVerifiedAt = &now
	}
	return nil
}
func (f *fakeEmailUsers) SetPassword(_ context.Context, _, hash string) error {
	f.password = hash
	return nil
}

type fakeSessions struct{ revoked []string }

func (f *fakeSessions) Logout(_ context.Context, id string) error {
	f.revoked = append(f.revoked, id)
	return nil
}

type captureMailer struct{ sent []mailer.Message }

func (c *captureMailer) Send(_ context.Context, m mailer.Message) error {
	c.sent = append(c.sent, m)
	return nil
}

type emailEnv struct {
	h        *Handler
	tokens   *fakeTokens
	users    *fakeEmailUsers
	sessions *fakeSessions
	mail     *captureMailer
}

func newEmailEnv() *emailEnv {
	e := &emailEnv{
		tokens:   newFakeTokens(),
		users:    &fakeEmailUsers{u: &user.User{ID: "u1", DisplayName: "Ana", Email: "ana@x.com"}},
		sessions: &fakeSessions{},
		mail:     &captureMailer{},
	}
	svc := &EmailService{
		tokens: e.tokens, users: e.users, sessions: e.sessions, mailer: e.mail,
		appURL: "https://app.test", async: func(f func()) { f() },
	}
	e.h = AuthHandler(nil, nil).WithEmail(svc)
	e.h.hashPassword = func([]byte) ([]byte, error) { return []byte("novo-hash"), nil }
	return e
}

func (e *emailEnv) post(path string, handler gin.HandlerFunc, body string, userID string) *httptest.ResponseRecorder {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.POST(path, func(c *gin.Context) {
		if userID != "" {
			c.Set("userID", userID)
		}
	}, handler)
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.RemoteAddr = "192.0.2.1:40000"
	r.ServeHTTP(w, req)
	return w
}

// tokenFromMail tira o token do link do último e-mail enviado.
func (e *emailEnv) tokenFromMail(t *testing.T) string {
	t.Helper()
	return e.tokenFromMailAt(t, len(e.mail.sent)-1)
}

// tokenFromMailAt tira o token do link do i-ésimo e-mail enviado.
func (e *emailEnv) tokenFromMailAt(t *testing.T, n int) string {
	t.Helper()
	if n < 0 || n >= len(e.mail.sent) {
		t.Fatalf("e-mail %d não enviado (enviados: %d)", n, len(e.mail.sent))
	}
	text := e.mail.sent[n].Text
	i := strings.Index(text, "?token=")
	if i < 0 {
		t.Fatalf("sem link no e-mail: %s", text)
	}
	rest := text[i+len("?token="):]
	if j := strings.IndexAny(rest, "\r\n "); j >= 0 {
		rest = rest[:j]
	}
	return rest
}

func TestForgotPasswordAnswersTheSameForUnknownAccounts(t *testing.T) {
	e := newEmailEnv()
	known := e.post("/f", e.h.ForgotPassword, `{"email":"ANA@x.com"}`, "")
	e2 := newEmailEnv()
	unknown := e2.post("/f", e2.h.ForgotPassword, `{"email":"ninguem@x.com"}`, "")

	if known.Code != http.StatusOK || unknown.Code != known.Code || known.Body.String() != unknown.Body.String() {
		t.Fatalf("respostas diferentes: %d %q vs %d %q", known.Code, known.Body, unknown.Code, unknown.Body)
	}
	if len(e.mail.sent) != 1 || len(e2.mail.sent) != 0 {
		t.Fatalf("envios: conhecida=%d desconhecida=%d", len(e.mail.sent), len(e2.mail.sent))
	}
}

func TestForgotPasswordLimitsMailsPerAddressSilently(t *testing.T) {
	e := newEmailEnv()
	for i := 0; i < forgotPerEmail+2; i++ {
		if w := e.post("/f", e.h.ForgotPassword, `{"email":"ana@x.com"}`, ""); w.Code != http.StatusOK {
			t.Fatalf("pedido %d: status %d", i, w.Code)
		}
	}
	if len(e.mail.sent) != forgotPerEmail {
		t.Fatalf("enviou %d e-mails, quer %d", len(e.mail.sent), forgotPerEmail)
	}
}

func TestResetPasswordFlowRevokesSessionsAndIsSingleUse(t *testing.T) {
	e := newEmailEnv()
	e.post("/f", e.h.ForgotPassword, `{"email":"ana@x.com"}`, "")
	token := e.tokenFromMail(t)

	body := `{"token":"` + token + `","password":"senhanova123"}`
	if w := e.post("/r", e.h.ResetPassword, body, ""); w.Code != http.StatusOK {
		t.Fatalf("reset: %d %s", w.Code, w.Body)
	}
	if e.users.password != "novo-hash" || !e.users.verified || len(e.sessions.revoked) != 1 {
		t.Fatalf("efeitos faltando: senha=%q verificado=%v sessões=%v", e.users.password, e.users.verified, e.sessions.revoked)
	}
	if w := e.post("/r", e.h.ResetPassword, body, ""); w.Code != http.StatusBadRequest {
		t.Fatalf("reuso do token: status %d, quer 400", w.Code)
	}
}

func TestResetPasswordWeakPasswordKeepsTheToken(t *testing.T) {
	e := newEmailEnv()
	e.post("/f", e.h.ForgotPassword, `{"email":"ana@x.com"}`, "")
	token := e.tokenFromMail(t)

	if w := e.post("/r", e.h.ResetPassword, `{"token":"`+token+`","password":"curta"}`, ""); w.Code != http.StatusBadRequest {
		t.Fatalf("senha curta: %d", w.Code)
	}
	if w := e.post("/r", e.h.ResetPassword, `{"token":"`+token+`","password":"senhanova123"}`, ""); w.Code != http.StatusOK {
		t.Fatalf("o token foi gasto pela senha fraca: %d", w.Code)
	}
}

func TestVerifyEmailRejectsWrongPurposeAndUnknownTokens(t *testing.T) {
	e := newEmailEnv()
	e.post("/f", e.h.ForgotPassword, `{"email":"ana@x.com"}`, "")
	resetToken := e.tokenFromMail(t)

	for _, tok := range []string{resetToken, "inventado", ""} {
		if w := e.post("/v", e.h.VerifyEmail, `{"token":"`+tok+`"}`, ""); w.Code != http.StatusBadRequest {
			t.Errorf("token %q: status %d, quer 400", tok, w.Code)
		}
	}
	if e.users.verified {
		t.Fatal("e-mail confirmado com token inválido")
	}
}

func TestResendVerificationThrottlesAndSkipsVerified(t *testing.T) {
	e := newEmailEnv()
	if w := e.post("/s", e.h.ResendVerification, `{}`, "u1"); w.Code != http.StatusOK || len(e.mail.sent) != 1 {
		t.Fatalf("primeiro reenvio: %d, e-mails=%d", w.Code, len(e.mail.sent))
	}
	if w := e.post("/s", e.h.ResendVerification, `{}`, "u1"); w.Code != http.StatusTooManyRequests {
		t.Fatalf("segundo reenvio seguido: %d, quer 429", w.Code)
	}

	e2 := newEmailEnv()
	now := time.Now()
	e2.users.u.EmailVerifiedAt = &now
	e2.post("/s", e2.h.ResendVerification, `{}`, "u1")
	if len(e2.mail.sent) != 0 {
		t.Fatal("reenviou para e-mail já confirmado")
	}
}

func TestRegisterSendsVerificationEmail(t *testing.T) {
	e := newEmailEnv()
	accounts := &fakeAccounts{}
	e.h.accounts = accounts
	e.h.service = &Service{secret: []byte("s"), repository: nil}
	// Sem banco para o refresh token, o cadastro para antes da resposta; o
	// e-mail já tem de ter saído por ser disparado logo após o Create.
	func() {
		defer func() { _ = recover() }()
		e.post("/reg", e.h.Register, `{"username":"nicccls","display_name":"N","email":"n@x.com","password":"12345678"}`, "")
	}()
	if len(e.mail.sent) != 1 || e.mail.sent[0].To != "n@x.com" {
		t.Fatalf("e-mail de confirmação não enviado: %+v", e.mail.sent)
	}
}
