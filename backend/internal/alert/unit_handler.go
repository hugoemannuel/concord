package alert

import (
	"context"
	"log"
	"net"
	"net/http"
	"regexp"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

// Regra 5: unidade do systemd que falhou. A unidade tem
// OnFailure=concord-alerta@%n.service, e o modelo
// (deploy/concord-alerta@.service) chama POST /internal/alerts/unit-failed
// com unit=<nome>. A rota é só da própria máquina: fora de /api, recusa quem
// não vem de loopback e qualquer pedido com cabeçalho de proxy (todo pedido
// que passa pelo Caddy traz X-Forwarded-For); o deploy/Caddyfile ainda
// responde 404 em /internal/* antes de chegar aqui.

// UnitFailedPath: a rota que o concord-alerta@.service chama.
const UnitFailedPath = "/internal/alerts/unit-failed"

const (
	// unitRepeatAfter: a mesma unidade falhando de novo antes disso só vai para o histórico.
	unitRepeatAfter = time.Hour
	unitBodyLimit   = 1024
)

var unitName = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9@._:-]{0,99}$`)

type eventNotifier interface {
	Notify(ctx context.Context, ev Event) error
}

// UnitHandler recebe o aviso do systemd.
type UnitHandler struct {
	alerts eventNotifier
	now    func() time.Time

	mu   sync.Mutex
	last map[string]time.Time
}

func NewUnitHandler(alerts eventNotifier) *UnitHandler {
	return &UnitHandler{alerts: alerts, now: time.Now, last: map[string]time.Time{}}
}

// UnitRoutes: fora de /api (sem o middleware de sessão: quem chama é o systemd).
func UnitRoutes(router *gin.Engine, h *UnitHandler) {
	router.POST(UnitFailedPath, h.Failed)
}

func (h *UnitHandler) Failed(c *gin.Context) {
	if !fromThisMachine(c.Request) {
		c.JSON(http.StatusForbidden, gin.H{"error": "local only"})
		return
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, unitBodyLimit)
	unit := c.PostForm("unit")
	if !unitName.MatchString(unit) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid unit"})
		return
	}
	now := h.now()
	ev := Event{RuleID: unitFailedRuleID, Channel: ChannelInfra, Level: LevelWarning, Text: unitFailedText(unit),
		StartedAt: now, EndedAt: now, Quiet: !h.firstInAWhile(unit, now)}
	if err := h.alerts.Notify(c.Request.Context(), ev); err != nil {
		if !ev.Quiet {
			h.forget(unit) // o curl tenta de novo, e a nova tentativa precisa postar
		}
		log.Printf("[alert] %s falhou, mas o aviso não saiu: %v", unit, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to notify"})
		return
	}
	c.Status(http.StatusNoContent)
}

// firstInAWhile: a unidade não falhou na última hora (e marca esta falha).
func (h *UnitHandler) firstInAWhile(unit string, now time.Time) bool {
	h.mu.Lock()
	defer h.mu.Unlock()
	last, seen := h.last[unit]
	if seen && now.Sub(last) < unitRepeatAfter {
		return false
	}
	h.last[unit] = now
	return true
}

func (h *UnitHandler) forget(unit string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	delete(h.last, unit)
}

// fromThisMachine: veio de 127.0.0.1/::1 e não passou por proxy.
func fromThisMachine(r *http.Request) bool {
	for _, header := range []string{"X-Forwarded-For", "Forwarded", "X-Real-IP"} {
		if r.Header.Get(header) != "" {
			return false
		}
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	ip := net.ParseIP(host)
	return err == nil && ip != nil && ip.IsLoopback()
}
