// Package authctx guarda e lê quem está autenticado no contexto do gin. Fica
// fora de internal/auth para qualquer domínio (até os que o auth importa)
// poder usar sem ciclo de import.
package authctx

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// UserIDKey é a chave em que o middleware de auth põe o ID de quem chama.
const UserIDKey = "userID"

// UserID devolve o ID de quem chama. Sem ID no contexto (rota montada sem o
// middleware), responde 401 e devolve false: quem chama só precisa retornar.
func UserID(c *gin.Context) (string, bool) {
	v, _ := c.Get(UserIDKey)
	id, _ := v.(string)
	if id == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return "", false
	}
	return id, true
}
