package castigo

import (
	"sync"
	"time"
)

// index: os castigos ativos em memória (a chamada consulta a cada entrada e
// a cada token da mídia, sem ir ao banco).
type index struct {
	mu sync.RWMutex
	// byServer: serverID -> userID -> castigo.
	byServer map[string]map[string]Castigo
	// punished: userID -> em quantos servidores tem castigo.
	punished map[string]int
}

func newIndex() *index {
	return &index{byServer: map[string]map[string]Castigo{}, punished: map[string]int{}}
}

func (x *index) get(serverID, userID string) (Castigo, bool) {
	x.mu.RLock()
	defer x.mu.RUnlock()
	c, ok := x.byServer[serverID][userID]
	return c, ok
}

func (x *index) put(c Castigo) {
	x.mu.Lock()
	defer x.mu.Unlock()
	users, ok := x.byServer[c.ServerID]
	if !ok {
		users = map[string]Castigo{}
		x.byServer[c.ServerID] = users
	}
	if _, had := users[c.UserID]; !had {
		x.punished[c.UserID]++
	}
	users[c.UserID] = c
}

func (x *index) remove(serverID, userID string) {
	x.mu.Lock()
	defer x.mu.Unlock()
	users := x.byServer[serverID]
	if _, had := users[userID]; !had {
		return
	}
	delete(users, userID)
	if len(users) == 0 {
		delete(x.byServer, serverID)
	}
	if x.punished[userID]--; x.punished[userID] <= 0 {
		delete(x.punished, userID)
	}
}

func (x *index) any(userID string) bool {
	x.mu.RLock()
	defer x.mu.RUnlock()
	return x.punished[userID] > 0
}

// ofServer: os castigos que valem agora no servidor.
func (x *index) ofServer(serverID string, now time.Time) []Castigo {
	x.mu.RLock()
	defer x.mu.RUnlock()
	out := []Castigo{}
	for _, c := range x.byServer[serverID] {
		if c.active(now) {
			out = append(out, c.pruned(now))
		}
	}
	return out
}

// all: cópia de todos (a varredura dos vencidos).
func (x *index) all() []Castigo {
	x.mu.RLock()
	defer x.mu.RUnlock()
	out := []Castigo{}
	for _, users := range x.byServer {
		for _, c := range users {
			out = append(out, c)
		}
	}
	return out
}
