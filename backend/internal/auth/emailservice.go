package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"log"
	"time"

	"github.com/jackc/pgx/v5"

	"gin-quickstart/backend/internal/platform/mailer"
	"gin-quickstart/backend/internal/user"
)

// Finalidades dos tokens enviados por e-mail (coluna email_tokens.purpose).
const (
	purposeVerifyEmail   = "verify_email"
	purposeResetPassword = "reset_password"
)

// Validade dos links.
const (
	verifyEmailTTL   = 24 * time.Hour
	resetPasswordTTL = time.Hour
)

// ErrInvalidEmailToken: token inexistente, expirado ou já usado (não diz qual).
var ErrInvalidEmailToken = errors.New("invalid or expired token")

// emailTokenStore guarda os tokens (trocável nos testes).
type emailTokenStore interface {
	// CreateEmailToken invalida os tokens pendentes da mesma finalidade e grava o novo.
	CreateEmailToken(ctx context.Context, userID, purpose, tokenHash string, expiresAt time.Time) error
	// ConsumeEmailToken marca o token como usado e devolve o dono; falha se
	// não existir, tiver expirado ou já tiver sido usado.
	ConsumeEmailToken(ctx context.Context, purpose, tokenHash string) (string, error)
}

// emailUsers é a parte do user.Service que os e-mails usam.
type emailUsers interface {
	FindByID(ctx context.Context, id string) (*user.User, error)
	FindByEmailFold(ctx context.Context, email string) (*user.User, error)
	MarkEmailVerified(ctx context.Context, id string) error
	SetPassword(ctx context.Context, id, hash string) error
}

// sessionRevoker derruba as sessões (refresh tokens) de uma conta.
type sessionRevoker interface {
	Logout(ctx context.Context, userID string) error
}

// EmailService cuida da confirmação de e-mail e da recuperação de senha.
type EmailService struct {
	tokens   emailTokenStore
	users    emailUsers
	sessions sessionRevoker
	mailer   mailer.Mailer
	appURL   string
	// async roda o envio fora do pedido (trocável nos testes). Uma falha de SMTP
	// nunca pode quebrar o cadastro nem mostrar se a conta existe.
	async func(func())
}

func NewEmailService(repo *Repository, users *user.Service, sessions *Service, m mailer.Mailer, appURL string) *EmailService {
	return &EmailService{
		tokens:   repo,
		users:    users,
		sessions: sessions,
		mailer:   m,
		appURL:   appURL,
		async:    func(f func()) { go f() },
	}
}

// newEmailToken devolve o token (vai no link) e o sha256 dele (vai no banco).
func newEmailToken() (token, hash string, err error) {
	var raw [32]byte
	if _, err = rand.Read(raw[:]); err != nil {
		return "", "", err
	}
	token = base64.RawURLEncoding.EncodeToString(raw[:])
	return token, hashEmailToken(token), nil
}

func hashEmailToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

type buildMail func(to, name, appURL, token string, ttl time.Duration) (mailer.Message, error)

// emailKind é o que muda de um e-mail com link para o outro.
type emailKind struct {
	purpose string
	ttl     time.Duration
	build   buildMail
}

var (
	verifyEmailKind   = emailKind{purposeVerifyEmail, verifyEmailTTL, mailer.VerifyEmail}
	resetPasswordKind = emailKind{purposeResetPassword, resetPasswordTTL, mailer.ResetPassword}
)

// SendVerification envia (em segundo plano) o link de confirmação de e-mail.
func (s *EmailService) SendVerification(u *user.User) {
	s.sendLater(u, verifyEmailKind)
}

// SendPasswordReset envia (em segundo plano) o link de redefinição de senha.
func (s *EmailService) SendPasswordReset(u *user.User) {
	s.sendLater(u, resetPasswordKind)
}

func (s *EmailService) sendLater(u *user.User, kind emailKind) {
	id, email, name := u.ID, u.Email, u.DisplayName
	s.async(func() {
		ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
		defer cancel()
		if err := s.send(ctx, id, email, name, kind); err != nil {
			log.Printf("[auth] e-mail %s para %s: %v", kind.purpose, id, err)
		}
	})
}

func (s *EmailService) send(ctx context.Context, userID, email, name string, kind emailKind) error {
	token, hash, err := newEmailToken()
	if err != nil {
		return err
	}
	if err := s.tokens.CreateEmailToken(ctx, userID, kind.purpose, hash, time.Now().Add(kind.ttl)); err != nil {
		return err
	}
	msg, err := kind.build(email, name, s.appURL, token, kind.ttl)
	if err != nil {
		return err
	}
	return s.mailer.Send(ctx, msg)
}

// VerifyEmail confirma o e-mail da conta dona do token.
func (s *EmailService) VerifyEmail(ctx context.Context, token string) error {
	userID, err := s.tokens.ConsumeEmailToken(ctx, purposeVerifyEmail, hashEmailToken(token))
	if err != nil {
		return err
	}
	return s.users.MarkEmailVerified(ctx, userID)
}

// ResetPassword troca a senha com o token do e-mail. Derruba todas as sessões
// e confirma o e-mail (quem abriu o link recebeu o e-mail). passwordHash já vem
// calculado (o bcrypt passa pelo semáforo do handler).
func (s *EmailService) ResetPassword(ctx context.Context, token, passwordHash string) error {
	userID, err := s.tokens.ConsumeEmailToken(ctx, purposeResetPassword, hashEmailToken(token))
	if err != nil {
		return err
	}
	if err := s.users.SetPassword(ctx, userID, passwordHash); err != nil {
		return err
	}
	if err := s.sessions.Logout(ctx, userID); err != nil {
		return err
	}
	return s.users.MarkEmailVerified(ctx, userID)
}

// FindByEmail acha a conta pelo e-mail (nil se não houver).
func (s *EmailService) FindByEmail(ctx context.Context, email string) (*user.User, error) {
	u, err := s.users.FindByEmailFold(ctx, email)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return u, nil
}

// Resend reenvia a confirmação; false se o e-mail já estava confirmado.
func (s *EmailService) Resend(ctx context.Context, userID string) (bool, error) {
	u, err := s.users.FindByID(ctx, userID)
	if err != nil {
		return false, err
	}
	if u.EmailVerifiedAt != nil {
		return false, nil
	}
	s.SendVerification(u)
	return true, nil
}
