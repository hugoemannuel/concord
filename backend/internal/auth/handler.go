package auth

import (
	"context"
	"errors"
	"log"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"

	"gin-quickstart/backend/internal/platform/ratelimit"
	"gin-quickstart/backend/internal/user"
)

// dummyPasswordHash é um hash qualquer, com o mesmo custo dos reais. Gerado
// no boot para o primeiro login sem conta não custar dois bcrypts.
var dummyPasswordHash = mustHash("salinha-login-sem-conta")

func mustHash(password string) []byte {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		panic(err)
	}
	return hash
}

// loginUsers é a parte do user.Service que o login usa (trocável nos testes).
type loginUsers interface {
	FindLoginByEmail(ctx context.Context, email string) (*user.User, error)
	FindLoginByUsername(ctx context.Context, username string) (*user.User, error)
}

// accountCreator é a parte do user.Service que o cadastro usa.
type accountCreator interface {
	CheckAvailable(ctx context.Context, username, email string) error
	Create(ctx context.Context, u *user.User) error
	SetBirthday(ctx context.Context, userID string, b user.Birthday) error
}

type Handler struct {
	service  *Service
	accounts accountCreator
	logins   loginUsers
	guard    *loginGuard
	// compareHash é o bcrypt do login (trocável nos testes).
	compareHash func(hash, password []byte) error
	// registerByIP: cadastros por IP (só 409 e sucesso contam).
	registerByIP *ratelimit.Limiter
	// hashPassword é o bcrypt do cadastro (trocável nos testes).
	hashPassword func(password []byte) ([]byte, error)
	// emails e limits ficam nulos até WithEmail (testes antigos não os usam).
	emails *EmailService
	limits *emailLimits
}

// Cadastros por IP por hora: cada um custa um bcrypt, e o 409 conjunto
// ainda permite sondar e-mails.
const (
	registrationsPerIP = 5
	registrationWindow = time.Hour
)

func defaultHashPassword(password []byte) ([]byte, error) {
	return bcrypt.GenerateFromPassword(password, bcrypt.DefaultCost)
}

func AuthHandler(service *Service, userService *user.Service) *Handler {
	return &Handler{
		service:  service,
		accounts: userService,
		logins:   userService,
		guard:    newLoginGuard(),

		compareHash:  bcrypt.CompareHashAndPassword,
		registerByIP: ratelimit.New(registrationsPerIP, registrationWindow, loginLimiterMaxKeys),
		hashPassword: defaultHashPassword,
	}
}

// bindJSON lê o corpo; corpo acima do limite (ver limitBody) vira 413.
func bindJSON(c *gin.Context, dst any) bool {
	if err := c.ShouldBindJSON(dst); err != nil {
		var tooLarge *http.MaxBytesError
		if errors.As(err, &tooLarge) {
			c.JSON(http.StatusRequestEntityTooLarge, gin.H{"error": "request too large"})
		} else {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		}
		return false
	}
	return true
}

// limitBody corta o corpo do pedido em n bytes, antes de qualquer leitura.
func limitBody(n int64) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, n)
		c.Next()
	}
}

// invalidCredentials é a única resposta de falha do login: não dá para saber
// se a conta existe.
func invalidCredentials(c *gin.Context) {
	c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
}

// tooManyAttempts: mesma mensagem genérica, com 429 e Retry-After.
func tooManyAttempts(c *gin.Context, retry time.Duration) {
	c.Header("Retry-After", ratelimit.RetryAfterSeconds(retry))
	c.JSON(http.StatusTooManyRequests, gin.H{"error": "invalid credentials"})
}

func (h *Handler) Register(c *gin.Context) {
	var input struct {
		Username    string `json:"username"`
		DisplayName string `json:"display_name"`
		Email       string `json:"email"`
		Password    string `json:"password"`
		// Aniversário opcional (dia, mês e ano).
		BirthdayDay   *int `json:"birthday_day"`
		BirthdayMonth *int `json:"birthday_month"`
		BirthdayYear  *int `json:"birthday_year"`
	}

	if !bindJSON(c, &input) {
		return
	}

	reg := user.NormalizeRegistration(user.Registration{
		Username:    input.Username,
		DisplayName: input.DisplayName,
		Email:       input.Email,
		Password:    input.Password,
	})
	if err := user.ValidateRegistration(reg); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := user.ValidateBirthday(input.BirthdayDay, input.BirthdayMonth, input.BirthdayYear, time.Now()); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Só agora conta no limite por IP: erro de validação não custa nada.
	// Nome/e-mail já usado (409) conta; erro interno devolve a vaga.
	ipSlot := ratelimit.IPKey(c.ClientIP())
	if retry, ok := h.registerByIP.Reserve(ipSlot); !ok {
		c.Header("Retry-After", ratelimit.RetryAfterSeconds(retry))
		c.JSON(http.StatusTooManyRequests, gin.H{"error": "too many registrations"})
		return
	}

	// Antes do bcrypt: nome ou e-mail já usado não gasta CPU.
	if err := h.accounts.CheckAvailable(c.Request.Context(), reg.Username, reg.Email); err != nil {
		h.respondCreateError(c, ipSlot, err)
		return
	}

	// Mesmo semáforo global do login; release deferido contra panic.
	var hashedPassword []byte
	gotSlot, err := func() (bool, error) {
		if !h.guard.acquireBcrypt(c.Request.Context()) {
			return false, nil
		}
		defer h.guard.releaseBcrypt()
		var err error
		hashedPassword, err = h.hashPassword([]byte(reg.Password))
		return true, err
	}()
	if !gotSlot {
		h.registerByIP.Undo(ipSlot)
		c.Header("Retry-After", ratelimit.RetryAfterSeconds(h.guard.bcryptWait))
		c.JSON(http.StatusTooManyRequests, gin.H{"error": "too many registrations"})
		return
	}
	if err != nil {
		h.registerByIP.Undo(ipSlot)
		log.Printf("[auth] hash password: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to hash password"})
		return
	}

	newUser := &user.User{
		Username:     reg.Username,
		DisplayName:  reg.DisplayName,
		Email:        reg.Email,
		PasswordHash: string(hashedPassword),
		Active:       true,
	}

	if err := h.accounts.Create(c.Request.Context(), newUser); err != nil {
		h.respondCreateError(c, ipSlot, err)
		return
	}

	// Link de confirmação de e-mail, em segundo plano.
	if h.emails != nil {
		h.emails.SendVerification(newUser)
	}

	if input.BirthdayDay != nil {
		birthday := user.Birthday{Day: input.BirthdayDay, Month: input.BirthdayMonth, Year: input.BirthdayYear, Announce: true}
		if err := h.accounts.SetBirthday(c.Request.Context(), newUser.ID, birthday); err != nil {
			log.Printf("[auth] save birthday for %s: %v", newUser.ID, err)
		}
	}

	accessToken, err := h.service.GenerateAccessToken(newUser.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate token"})
		return
	}

	refreshToken, err := h.service.GenerateRefreshToken(c.Request.Context(), newUser.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate refresh token"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"access_token":  accessToken,
		"refresh_token": refreshToken,
	})
}

// respondCreateError responde a falha do cadastro. Só o nome/e-mail já usado
// mantém a vaga do IP; o resto devolve.
func (h *Handler) respondCreateError(c *gin.Context, ipSlot string, err error) {
	switch {
	case errors.Is(err, user.ErrIdentityTaken):
		// Mesma mensagem para usuário e e-mail; nada do Postgres na resposta.
		c.JSON(http.StatusConflict, gin.H{"error": user.ErrIdentityTaken.Error()})
	case errors.Is(err, user.ErrUsernameRequired), errors.Is(err, user.ErrEmailRequired):
		h.registerByIP.Undo(ipSlot)
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
	default:
		h.registerByIP.Undo(ipSlot)
		log.Printf("[auth] create user: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create user"})
	}
}

func (h *Handler) Login(c *gin.Context) {
	var input struct {
		// Login: e-mail ou nome de usuário (campo novo).
		Login string `json:"login"`
		// Email: campo antigo, mantido para os apps desktop já instalados.
		Email    string `json:"email"`
		Password string `json:"password"`
	}

	if !bindJSON(c, &input) {
		return
	}

	identifier, ok := ParseLoginIdentifier(input.Login, input.Email)
	var limited *LoginIdentifier
	if ok {
		limited = &identifier
	}
	// Antes de qualquer busca ou bcrypt: conta o IP e já reserva a tentativa
	// do identificador. c.ClientIP() só confia nos proxies configurados
	// (internal/platform/clientip).
	if retry, allowed := h.guard.begin(c.ClientIP(), limited); !allowed {
		tooManyAttempts(c, retry)
		return
	}
	// Senha acima do limite do bcrypt nunca é a certa: sem busca nem bcrypt.
	if !ok || user.PasswordTooLong(input.Password) {
		invalidCredentials(c)
		return
	}

	var foundUser *user.User
	var err error
	if identifier.Kind == IdentifierEmail {
		foundUser, err = h.logins.FindLoginByEmail(c.Request.Context(), identifier.Value)
	} else {
		foundUser, err = h.logins.FindLoginByUsername(c.Request.Context(), identifier.Value)
	}
	if err != nil && !errors.Is(err, user.ErrLoginNotFound) {
		// Banco fora do ar: responde igual, fica no log e não conta.
		log.Printf("[auth] login lookup: %v", err)
		h.guard.undo(identifier)
		invalidCredentials(c)
		return
	}

	// Conta inexistente gasta o mesmo bcrypt de uma senha errada, para o
	// tempo de resposta também não denunciar que ela não existe.
	hash := dummyPasswordHash
	if foundUser != nil {
		hash = []byte(foundUser.PasswordHash)
	}
	// O release é deferido: um panic no compare (recuperado pelo gin.Recovery)
	// não pode vazar a vaga.
	gotSlot, err := func() (bool, error) {
		if !h.guard.acquireBcrypt(c.Request.Context()) {
			return false, nil
		}
		defer h.guard.releaseBcrypt()
		return true, h.compareHash(hash, []byte(input.Password))
	}()
	if !gotSlot {
		h.guard.undo(identifier)
		tooManyAttempts(c, h.guard.bcryptWait)
		return
	}
	if foundUser == nil || err != nil {
		// A reserva feita em begin fica: é a falha contada.
		invalidCredentials(c)
		return
	}
	h.guard.succeeded(identifier)

	accessToken, err := h.service.GenerateAccessToken(foundUser.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate token"})
		return
	}

	refreshToken, err := h.service.GenerateRefreshToken(c.Request.Context(), foundUser.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate refresh token"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"access_token":  accessToken,
		"refresh_token": refreshToken,
	})
}
