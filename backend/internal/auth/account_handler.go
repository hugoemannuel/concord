package auth

import (
	"context"
	"errors"
	"log"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"

	"gin-quickstart/backend/internal/platform/ratelimit"
	"gin-quickstart/backend/internal/user"
)

// Senhas erradas por conta na troca de @/e-mail: quem tem só o token (sessão
// roubada) não consegue chutar a senha.
const (
	accountPasswordFailures = 5
	accountPasswordWindow   = 15 * time.Minute
)

// CodeWrongPassword vai no corpo do 403 de senha atual errada (não é 401:
// o app trataria como sessão vencida e tentaria renovar o token).
const CodeWrongPassword = "wrong_password"

// CodeUsernameCooldown vai no 429 de quem trocou o @ há menos de 7 dias,
// com available_at (quando libera).
const CodeUsernameCooldown = "username_cooldown"

// accountLookup busca a conta para conferir a senha.
type accountLookup interface {
	FindByID(ctx context.Context, id string) (*user.User, error)
}

// accountChanges é o user.AccountService.
type accountChanges interface {
	ChangeUsername(ctx context.Context, userID, username string) (*user.User, error)
	ChangeEmail(ctx context.Context, userID, email string) (*user.User, bool, error)
}

// verificationSender manda o link de confirmação para o e-mail novo (os links
// mandados ao endereço antigo param de valer).
type verificationSender interface {
	SendNewAddressVerification(ctx context.Context, u *user.User) error
}

// AccountHandler troca o nome de usuário e o e-mail, sempre com a senha atual.
type AccountHandler struct {
	users   accountLookup
	changes accountChanges
	// verify fica nulo sem o serviço de e-mail.
	verify verificationSender
	// guard é o do login: as mesmas vagas de bcrypt.
	guard       *loginGuard
	compareHash func(hash, password []byte) error
	attempts    *ratelimit.Limiter
}

// NewAccountHandler usa o bcrypt e as vagas do login (auth) e, se houver, o
// e-mail de confirmação.
func NewAccountHandler(auth *Handler, users accountLookup, changes accountChanges) *AccountHandler {
	h := &AccountHandler{
		users:       users,
		changes:     changes,
		guard:       auth.guard,
		compareHash: auth.compareHash,
		attempts:    ratelimit.New(accountPasswordFailures, accountPasswordWindow, loginLimiterMaxKeys),
	}
	if auth.emails != nil {
		h.verify = auth.emails
	}
	return h
}

type usernameChange struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type emailChange struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

// ChangeUsername: PUT /users/me/username {username, password}.
func (h *AccountHandler) ChangeUsername(c *gin.Context) {
	var in usernameChange
	if !bindJSON(c, &in) {
		return
	}
	userID, ok := h.confirmPassword(c, in.Password)
	if !ok {
		return
	}
	u, err := h.changes.ChangeUsername(c.Request.Context(), userID, in.Username)
	if err != nil {
		respondAccountError(c, err)
		return
	}
	c.JSON(http.StatusOK, u.Self())
}

// ChangeEmail: PUT /users/me/email {email, password}. E-mail novo volta a
// "não confirmado" e recebe o link de confirmação.
func (h *AccountHandler) ChangeEmail(c *gin.Context) {
	var in emailChange
	if !bindJSON(c, &in) {
		return
	}
	userID, ok := h.confirmPassword(c, in.Password)
	if !ok {
		return
	}
	u, confirm, err := h.changes.ChangeEmail(c.Request.Context(), userID, in.Email)
	if err != nil {
		respondAccountError(c, err)
		return
	}
	if confirm && h.verify != nil {
		h.sendNewAddressLink(c.Request.Context(), u)
	}
	c.JSON(http.StatusOK, u.Self())
}

// sendNewAddressLink: o e-mail já foi trocado, então uma falha aqui só vai
// para o log (a pessoa pode pedir o reenvio).
func (h *AccountHandler) sendNewAddressLink(ctx context.Context, u *user.User) {
	if err := h.verify.SendNewAddressVerification(ctx, u); err != nil {
		log.Printf("[auth] links do e-mail antigo de %s: %v", u.ID, err)
	}
}

func respondAccountError(c *gin.Context, err error) {
	var cooldown *user.UsernameCooldownError
	switch {
	case errors.As(err, &cooldown):
		c.JSON(http.StatusTooManyRequests, gin.H{
			"error":        err.Error(),
			"code":         CodeUsernameCooldown,
			"available_at": cooldown.Until.UTC(),
		})
	case errors.Is(err, user.ErrUsernameTaken), errors.Is(err, user.ErrEmailTaken):
		c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
	case errors.Is(err, user.ErrInvalidUsername), errors.Is(err, user.ErrUsernameReserved),
		errors.Is(err, user.ErrInvalidEmail):
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
	default:
		log.Printf("[auth] troca de conta: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update account"})
	}
}

func wrongPassword(c *gin.Context) {
	c.JSON(http.StatusForbidden, gin.H{"error": "Senha incorreta.", "code": CodeWrongPassword})
}

// confirmPassword confere a senha atual de quem está logado. A tentativa é
// reservada antes do bcrypt (rajadas não passam inteiras); acertar zera e
// falha nossa (banco, sem vaga) devolve. false = já respondeu.
func (h *AccountHandler) confirmPassword(c *gin.Context, password string) (string, bool) {
	id, _ := c.Get("userID")
	userID, _ := id.(string)
	if userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return "", false
	}
	if retry, ok := h.attempts.Reserve(userID); !ok {
		tooManyAttempts(c, retry)
		return "", false
	}
	// Acima do limite do bcrypt nunca é a senha certa (e conta como erro).
	if user.PasswordTooLong(password) {
		wrongPassword(c)
		return "", false
	}
	u, err := h.users.FindByID(c.Request.Context(), userID)
	if err != nil {
		h.attempts.Undo(userID)
		log.Printf("[auth] troca de conta, busca: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update account"})
		return "", false
	}
	return userID, h.checkHash(c, userID, u.PasswordHash, password)
}

// checkHash roda o bcrypt numa vaga do login (release deferido contra panic).
func (h *AccountHandler) checkHash(c *gin.Context, userID, hash, password string) bool {
	gotSlot, err := func() (bool, error) {
		if !h.guard.acquireBcrypt(c.Request.Context()) {
			return false, nil
		}
		defer h.guard.releaseBcrypt()
		return true, h.compareHash([]byte(hash), []byte(password))
	}()
	if !gotSlot {
		h.attempts.Undo(userID)
		tooManyAttempts(c, h.guard.bcryptWait)
		return false
	}
	if err != nil {
		wrongPassword(c)
		return false
	}
	h.attempts.Reset(userID)
	return true
}
