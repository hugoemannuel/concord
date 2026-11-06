package auth

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"log"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/gin-gonic/gin"

	"gin-quickstart/backend/internal/platform/authctx"
	"gin-quickstart/backend/internal/platform/ratelimit"
	"gin-quickstart/backend/internal/user"
)

// Limites dos endpoints de e-mail. Os links têm 256 bits, então adivinhar não
// é o risco: o que se protege é o SMTP (spam) e o bcrypt.
const (
	verifyAttemptsPerIP = 60
	forgotPerIP         = 10
	forgotPerEmail      = 3
	resetAttemptsPerIP  = 20
	resendPerMinute     = 1
	resendPerHour       = 5
	emailLimitWindow    = time.Hour
)

// emailLimits agrupa os limitadores dos endpoints de e-mail.
type emailLimits struct {
	verifyByIP   *ratelimit.Limiter
	forgotByIP   *ratelimit.Limiter
	forgotByMail *ratelimit.Limiter
	resetByIP    *ratelimit.Limiter
	resendMinute *ratelimit.Limiter
	resendHour   *ratelimit.Limiter
}

func newEmailLimits() *emailLimits {
	return &emailLimits{
		verifyByIP:   ratelimit.New(verifyAttemptsPerIP, emailLimitWindow, loginLimiterMaxKeys),
		forgotByIP:   ratelimit.New(forgotPerIP, emailLimitWindow, loginLimiterMaxKeys),
		forgotByMail: ratelimit.New(forgotPerEmail, emailLimitWindow, loginLimiterMaxKeys),
		resetByIP:    ratelimit.New(resetAttemptsPerIP, emailLimitWindow, loginLimiterMaxKeys),
		resendMinute: ratelimit.New(resendPerMinute, time.Minute, loginLimiterMaxKeys),
		resendHour:   ratelimit.New(resendPerHour, emailLimitWindow, loginLimiterMaxKeys),
	}
}

// WithEmail liga a confirmação de e-mail e a recuperação de senha.
func (h *Handler) WithEmail(s *EmailService) *Handler {
	h.emails = s
	h.limits = newEmailLimits()
	return h
}

func rateLimited(c *gin.Context, retry time.Duration) {
	c.Header("Retry-After", ratelimit.RetryAfterSeconds(retry))
	c.JSON(http.StatusTooManyRequests, gin.H{"error": "too many requests"})
}

func invalidEmailToken(c *gin.Context) {
	c.JSON(http.StatusBadRequest, gin.H{"error": ErrInvalidEmailToken.Error()})
}

// mailKey é a chave do limite por e-mail: o hash, para o mapa não guardar endereços.
func mailKey(email string) string {
	sum := sha256.Sum256([]byte(strings.ToLower(email)))
	return hex.EncodeToString(sum[:])
}

// VerifyEmail: POST /auth/verify-email {token}.
func (h *Handler) VerifyEmail(c *gin.Context) {
	var input struct {
		Token string `json:"token"`
	}
	if !bindJSON(c, &input) {
		return
	}
	if retry, ok := h.limits.verifyByIP.Allow(ratelimit.IPKey(c.ClientIP())); !ok {
		rateLimited(c, retry)
		return
	}
	if input.Token == "" {
		invalidEmailToken(c)
		return
	}
	if err := h.emails.VerifyEmail(c.Request.Context(), input.Token); err != nil {
		if errors.Is(err, ErrInvalidEmailToken) {
			invalidEmailToken(c)
			return
		}
		log.Printf("[auth] verify email: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to verify email"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "email verified"})
}

// ResendVerification: POST /auth/resend-verification (logado).
func (h *Handler) ResendVerification(c *gin.Context) {
	userID, ok := authctx.UserID(c)
	if !ok {
		return
	}
	id := userID

	if retry, ok := h.limits.resendMinute.Allow(id); !ok {
		rateLimited(c, retry)
		return
	}
	if retry, ok := h.limits.resendHour.Allow(id); !ok {
		h.limits.resendMinute.Undo(id)
		rateLimited(c, retry)
		return
	}
	sent, err := h.emails.Resend(c.Request.Context(), id)
	if err != nil {
		h.limits.resendMinute.Undo(id)
		h.limits.resendHour.Undo(id)
		log.Printf("[auth] resend verification: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to resend email"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"sent": sent})
}

// ForgotPassword: POST /auth/forgot-password {email}. Responde igual exista a
// conta ou não.
func (h *Handler) ForgotPassword(c *gin.Context) {
	var input struct {
		Email string `json:"email"`
	}
	if !bindJSON(c, &input) {
		return
	}
	email := strings.TrimSpace(input.Email)
	if email == "" || utf8.RuneCountInString(email) > 255 {
		c.JSON(http.StatusBadRequest, gin.H{"error": user.ErrInvalidEmail.Error()})
		return
	}
	if retry, ok := h.limits.forgotByIP.Allow(ratelimit.IPKey(c.ClientIP())); !ok {
		rateLimited(c, retry)
		return
	}

	// Estourou o limite do e-mail: cala em vez de responder diferente (senão
	// o 429 mostraria que a conta existe, e a caixa de entrada seria alvo de spam).
	if _, ok := h.limits.forgotByMail.Allow(mailKey(email)); ok {
		u, err := h.emails.FindByEmail(c.Request.Context(), email)
		switch {
		case err != nil:
			log.Printf("[auth] forgot password lookup: %v", err)
		case u != nil:
			h.emails.SendPasswordReset(u)
		}
	}
	c.JSON(http.StatusOK, gin.H{"message": "if the account exists, an email was sent"})
}

// ResetPassword: POST /auth/reset-password {token, password}.
func (h *Handler) ResetPassword(c *gin.Context) {
	var input struct {
		Token    string `json:"token"`
		Password string `json:"password"`
	}
	if !bindJSON(c, &input) {
		return
	}
	// Senha fraca não gasta o token nem o bcrypt.
	if err := user.ValidatePassword(input.Password); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	ip := ratelimit.IPKey(c.ClientIP())
	if retry, ok := h.limits.resetByIP.Allow(ip); !ok {
		rateLimited(c, retry)
		return
	}
	if input.Token == "" {
		invalidEmailToken(c)
		return
	}

	var hashed []byte
	gotSlot, err := func() (bool, error) {
		if !h.guard.acquireBcrypt(c.Request.Context()) {
			return false, nil
		}
		defer h.guard.releaseBcrypt()
		var err error
		hashed, err = h.hashPassword([]byte(input.Password))
		return true, err
	}()
	if !gotSlot {
		h.limits.resetByIP.Undo(ip)
		rateLimited(c, h.guard.bcryptWait)
		return
	}
	if err != nil {
		h.limits.resetByIP.Undo(ip)
		log.Printf("[auth] reset password hash: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to hash password"})
		return
	}

	if err := h.emails.ResetPassword(c.Request.Context(), input.Token, string(hashed)); err != nil {
		if errors.Is(err, ErrInvalidEmailToken) {
			invalidEmailToken(c)
			return
		}
		log.Printf("[auth] reset password: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to reset password"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "password updated"})
}
