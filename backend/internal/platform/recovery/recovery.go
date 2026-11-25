// Package recovery troca o gin.Recovery(): mesmo log com a pilha, mesma
// resposta 500 e o mesmo cuidado com a conexão caída (broken pipe), mais uma
// lista de observadores que ficam sabendo de cada panic (docs/adr/0068).
//
// O internal/apperrors se registra para guardar o panic no relatório de erros;
// a tarefa obs-servidor (panics por minuto) pode se registrar com Observe sem
// conhecer aquele pacote.
package recovery

import (
	"fmt"
	"log"
	"net/http"
	"runtime/debug"
	"sync"
	"sync/atomic"

	"github.com/gin-gonic/gin"
)

// Panic: o que um observador recebe. Route é o padrão da rota (c.FullPath(),
// vazio quando nenhuma rota casou); UserID vem vazio sem login.
type Panic struct {
	Route  string
	Method string
	Value  string
	Stack  []byte
	UserID string
}

var (
	mu        sync.Mutex
	observers atomic.Pointer[[]func(Panic)]
)

// Observe registra fn para ser chamada a cada panic recuperado. fn roda no
// pedido que quebrou: deve ser rápida e não bloquear.
func Observe(fn func(Panic)) {
	mu.Lock()
	defer mu.Unlock()
	var next []func(Panic)
	if cur := observers.Load(); cur != nil {
		next = append(next, *cur...)
	}
	next = append(next, fn)
	observers.Store(&next)
}

// Middleware: o gin.CustomRecovery (log e broken pipe como o gin faz) com o
// aviso aos observadores antes do 500.
func Middleware() gin.HandlerFunc {
	return gin.CustomRecovery(func(c *gin.Context, rec any) {
		notify(Panic{
			Route:  c.FullPath(),
			Method: c.Request.Method,
			Value:  fmt.Sprint(rec),
			Stack:  debug.Stack(),
			UserID: c.GetString("userID"),
		})
		c.AbortWithStatus(http.StatusInternalServerError)
	})
}

func notify(p Panic) {
	cur := observers.Load()
	if cur == nil {
		return
	}
	for _, fn := range *cur {
		safeCall(fn, p)
	}
}

// safeCall: um observador quebrado vai para o log e não derruba a resposta.
func safeCall(fn func(Panic), p Panic) {
	defer func() {
		if rec := recover(); rec != nil {
			log.Printf("[recovery] observador de panic quebrou: %v", rec)
		}
	}()
	fn(p)
}
