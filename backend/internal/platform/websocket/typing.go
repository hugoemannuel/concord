package websocket

import (
	"context"
	"encoding/json"
	"hash/fnv"
	"sync"
	"time"

	"gin-quickstart/backend/internal/message"
	"gin-quickstart/backend/internal/platform/wsevent"
	"gin-quickstart/backend/internal/user"
)

const (
	// O app manda no máximo um "digitando" a cada 3 s, mais o stop. Por
	// pessoa vale cerca de 1 por segundo de cada tipo, com folga de 3 para a
	// sequência typing → stop → typing de quem envia e já volta a digitar.
	typingRefill = time.Second
	typingBurst  = 3
	// Acima disso o limitador esquece (no máximo uma vez por typingRefill)
	// quem já está com a folga cheia.
	typingLimiterSweepAt = 1024

	// Digitando é só um aviso: a decisão de acesso e o nome podem ficar um
	// pouco velhos (a mensagem em si continua conferindo o acesso).
	typingAllowTTL = 45 * time.Second
	typingDenyTTL  = 10 * time.Second
	typingNameTTL  = 45 * time.Second
	typingCacheMax = 4096

	// Fora do loop de leitura da conexão: banco lento não atrasa subscribe
	// nem call:*. Fila cheia descarta (o próximo aviso vem em 3 s).
	typingWorkers    = 4
	typingQueueSize  = 256
	typingLookupWait = 3 * time.Second
)

// TypingAccess aplica a regra de quem pode escrever na sala e, numa DM,
// devolve os participantes (message.ServiceRoomAccess.WriteParticipants).
type TypingAccess interface {
	WriteParticipants(ctx context.Context, room message.Room, userID string) ([]string, error)
}

// UserLookup busca o nome de quem está digitando (user.Service.FindByID).
type UserLookup func(ctx context.Context, userID string) (*user.User, error)

type typingAccessEntry struct {
	allowed      bool
	participants []string
}

type typingName struct {
	display  string
	username string
}

type typingJob struct {
	userID         string
	evType         string
	room           string
	channelID      string
	conversationID string
}

// typingBucket: fichas de quem digita (cada evento gasta uma).
type typingBucket struct {
	tokens float64
	at     time.Time
}

// Typing repassa o "fulano está digitando…" de um canal ou DM para quem vê a
// sala, menos quem digita. Nada é salvo.
type Typing struct {
	hub    *Hub
	access TypingAccess
	users  UserLookup
	now    func() time.Time

	allowCache *ttlCache[string, typingAccessEntry] // "<user>\x00<sala>"
	nameCache  *ttlCache[string, typingName]

	// Uma fila por worker; a mesma pessoa cai sempre no mesmo worker, então
	// typing e stop dela não trocam de ordem.
	queues  []chan typingJob
	pending sync.WaitGroup

	mu        sync.Mutex
	buckets   map[string]*typingBucket // "<user>|<tipo>"
	lastSweep time.Time
}

func NewTyping(hub *Hub, access TypingAccess, users UserLookup) *Typing {
	return newTyping(hub, access, users, typingWorkers, typingQueueSize)
}

func newTyping(hub *Hub, access TypingAccess, users UserLookup, workers int, queueSize int) *Typing {
	t := &Typing{
		hub:     hub,
		access:  access,
		users:   users,
		now:     time.Now,
		buckets: make(map[string]*typingBucket),
	}
	clock := func() time.Time { return t.now() }
	t.allowCache = newTTLCache[string, typingAccessEntry](typingCacheMax, clock)
	t.nameCache = newTTLCache[string, typingName](typingCacheMax, clock)
	for i := 0; i < workers; i++ {
		q := make(chan typingJob, queueSize)
		t.queues = append(t.queues, q)
		go t.work(q)
	}
	return t
}

// Handle trata "typing" e "typing:stop" vindos do app ({room}). Não bloqueia:
// só valida o formato e o limite e põe na fila.
func (t *Typing) Handle(_ context.Context, userID string, evType string, payload json.RawMessage) {
	if evType != "typing" && evType != "typing:stop" {
		return
	}
	var p struct {
		Room string `json:"room"`
	}
	if err := json.Unmarshal(payload, &p); err != nil {
		return
	}
	channelID, conversationID, _, _, _ := parseRoom(p.Room)
	if channelID == "" && conversationID == "" {
		return
	}
	// O limite vem antes de tudo: evento descartado não consulta o banco.
	if !t.allow(userID + "|" + evType) {
		return
	}

	job := typingJob{userID: userID, evType: evType, room: p.Room, channelID: channelID, conversationID: conversationID}
	t.pending.Add(1)
	select {
	case t.queues[shard(userID, len(t.queues))] <- job:
	default:
		t.pending.Done() // fila cheia: descarta
	}
}

// wait espera a fila esvaziar (testes).
func (t *Typing) wait() {
	t.pending.Wait()
}

func (t *Typing) work(q chan typingJob) {
	for job := range q {
		t.process(job)
		t.pending.Done()
	}
}

func (t *Typing) process(job typingJob) {
	ctx, cancel := context.WithTimeout(context.Background(), typingLookupWait)
	defer cancel()

	entry, ok := t.roomAccess(ctx, job)
	if !ok || !entry.allowed {
		return
	}

	out := map[string]interface{}{
		"room":    job.room,
		"user_id": job.userID,
	}
	if job.evType == "typing" {
		name, ok := t.name(ctx, job.userID)
		if !ok {
			return
		}
		out["display_name"] = name.display
		out["username"] = name.username
	}

	t.hub.BroadcastToRoomsExcept(typingRooms(job, entry.participants), job.userID, wsevent.Marshal(job.evType, out))
}

// roomAccess: mesma regra de quem pode escrever mensagem, guardada por pouco
// tempo. ok=false quando o banco falhou (nada é guardado).
func (t *Typing) roomAccess(ctx context.Context, job typingJob) (typingAccessEntry, bool) {
	key := job.userID + "\x00" + job.room
	if entry, ok := t.allowCache.Get(key); ok {
		return entry, true
	}
	participants, err := t.access.WriteParticipants(ctx, message.Room{ChannelID: job.channelID, ConversationID: job.conversationID}, job.userID)
	switch {
	case err == nil:
		entry := typingAccessEntry{allowed: true, participants: participants}
		t.allowCache.Set(key, entry, typingAllowTTL)
		return entry, true
	case ctx.Err() != nil:
		return typingAccessEntry{}, false
	default:
		entry := typingAccessEntry{allowed: false}
		t.allowCache.Set(key, entry, typingDenyTTL)
		return entry, true
	}
}

func (t *Typing) name(ctx context.Context, userID string) (typingName, bool) {
	if name, ok := t.nameCache.Get(userID); ok {
		return name, true
	}
	u, err := t.users(ctx, userID)
	if err != nil || u == nil {
		return typingName{}, false
	}
	name := typingName{display: u.DisplayName, username: u.Username}
	if name.display == "" {
		name.display = u.Username
	}
	t.nameCache.Set(userID, name, typingNameTTL)
	return name, true
}

// typingRooms segue o caminho do message:create, menos a sala do servidor:
// lá estão todos com o servidor aberto, em qualquer canal, e o digitando só
// aparece no canal aberto. Na DM vai também para a sala pessoal de cada
// participante (dica na lista de conversas).
func typingRooms(job typingJob, participants []string) []string {
	if job.channelID != "" {
		return []string{"channel:" + job.channelID}
	}
	return conversationRooms(job.conversationID, participants)
}

func shard(userID string, n int) int {
	h := fnv.New32a()
	_, _ = h.Write([]byte(userID))
	return int(h.Sum32() % uint32(n))
}

func (t *Typing) allow(key string) bool {
	now := t.now()
	t.mu.Lock()
	defer t.mu.Unlock()
	if len(t.buckets) >= typingLimiterSweepAt && now.Sub(t.lastSweep) >= typingRefill {
		t.lastSweep = now
		for k, b := range t.buckets {
			if b.fill(now) >= typingBurst {
				delete(t.buckets, k)
			}
		}
	}
	b, ok := t.buckets[key]
	if !ok {
		b = &typingBucket{tokens: typingBurst, at: now}
		t.buckets[key] = b
	}
	b.tokens, b.at = b.fill(now), now
	if b.tokens < 1 {
		return false
	}
	b.tokens--
	return true
}

// fill: fichas de agora (uma a cada typingRefill, até typingBurst).
func (b *typingBucket) fill(now time.Time) float64 {
	tokens := b.tokens + float64(now.Sub(b.at))/float64(typingRefill)
	if tokens > typingBurst {
		return typingBurst
	}
	return tokens
}
