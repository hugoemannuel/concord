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
	// AddEmailToken grava o novo e mantém os pendentes valendo.
	AddEmailToken(ctx context.Context, userID, purpose, tokenHash string, expiresAt time.Time) error
	// ConsumeEmailToken marca o token como usado e devolve o dono; falha se
	// não existir, tiver expirado ou já tiver sido usado.
	ConsumeEmailToken(ctx context.Context, purpose, tokenHash string) (string, error)
	// EmailTokenOwner devolve o dono do token, mesmo usado ou vencido.
	EmailTokenOwner(ctx context.Context, purpose, tokenHash string) (string, error)
	// InvalidateEmailTokens invalida os pendentes da conta, de qualquer finalidade.
	InvalidateEmailTokens(ctx context.Context, userID string) error
}

// emailUsers é a parte do user.Service que os e-mails usam.
type emailUsers interface {
	FindByID(ctx context.Context, id string) (*user.User, error)
	FindByEmailFold(ctx context.Context, email string) (*user.User, error)
	MarkEmailVerified(ctx context.Context, id string) error
	SetPassword(ctx context.Context, id, hash string) error
}

// sessionRevoker derruba todas as sessões de uma conta (versão e refresh tokens).
type sessionRevoker interface {
	RevokeAllSessions(ctx context.Context, userID string) error
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
	// replace: o link novo invalida os pendentes da mesma finalidade.
	replace bool
}

var (
	// Cadastro, reenvio e e-mail novo: os links anteriores continuam valendo.
	// Quem reenvia antes de o primeiro e-mail chegar pode clicar em qualquer um.
	verifyEmailKind = emailKind{purpose: purposeVerifyEmail, ttl: verifyEmailTTL, build: mailer.VerifyEmail, replace: false}
	// Reset de senha: só o último link vale.
	resetPasswordKind = emailKind{purpose: purposeResetPassword, ttl: resetPasswordTTL, build: mailer.ResetPassword, replace: true}
)

// SendVerification envia (em segundo plano) o link de confirmação de e-mail.
func (s *EmailService) SendVerification(u *user.User) {
	s.sendLater(u, verifyEmailKind)
}

// SendNewAddressVerification invalida na hora os links pendentes de qualquer
// finalidade (nada mandado ao endereço antigo pode confirmar o novo nem trocar
// a senha) e envia, em segundo plano, o link de confirmação do e-mail novo.
func (s *EmailService) SendNewAddressVerification(ctx context.Context, u *user.User) error {
	if err := s.tokens.InvalidateEmailTokens(ctx, u.ID); err != nil {
		return err
	}
	s.sendLater(u, verifyEmailKind)
	return nil
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
	if err := s.saveToken(ctx, userID, hash, kind); err != nil {
		return err
	}
	msg, err := kind.build(email, name, s.appURL, token, kind.ttl)
	if err != nil {
		return err
	}
	return s.mailer.Send(ctx, msg)
}

func (s *EmailService) saveToken(ctx context.Context, userID, hash string, kind emailKind) error {
	expiresAt := time.Now().Add(kind.ttl)
	if kind.replace {
		return s.tokens.CreateEmailToken(ctx, userID, kind.purpose, hash, expiresAt)
	}
	return s.tokens.AddEmailToken(ctx, userID, kind.purpose, hash, expiresAt)
}

// VerifyEmail confirma o e-mail da conta dona do token. Link já usado ou
// vencido de uma conta que já confirmou também é sucesso (sem gravar nada):
// aberto duas vezes, ou antes por um scanner de links, ele não pode dizer
// "inválido" para quem está com o e-mail confirmado.
func (s *EmailService) VerifyEmail(ctx context.Context, token string) error {
	hash := hashEmailToken(token)
	userID, err := s.tokens.ConsumeEmailToken(ctx, purposeVerifyEmail, hash)
	if errors.Is(err, ErrInvalidEmailToken) {
		return s.alreadyVerified(ctx, hash)
	}
	if err != nil {
		return err
	}
	return s.users.MarkEmailVerified(ctx, userID)
}

// alreadyVerified: nil se o dono do link já confirmou o e-mail; senão o link
// é inválido.
func (s *EmailService) alreadyVerified(ctx context.Context, hash string) error {
	userID, err := s.tokens.EmailTokenOwner(ctx, purposeVerifyEmail, hash)
	if err != nil {
		return err
	}
	u, err := s.users.FindByID(ctx, userID)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrInvalidEmailToken
	}
	if err != nil {
		return err
	}
	if u.EmailVerifiedAt == nil {
		return ErrInvalidEmailToken
	}
	return nil
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
	if err := s.sessions.RevokeAllSessions(ctx, userID); err != nil {
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
