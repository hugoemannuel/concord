package castigo

import (
	"slices"
	"sync"
	"time"

	"gin-quickstart/backend/internal/permission"

	"github.com/google/uuid"
)

// Votação de castigo: quem está na call abre; votam os membros do servidor
// que estavam na call quando ela abriu, menos o alvo. Passa com mais da
// metade desses votos (quem abre já vota sim). Com menos de 2 votantes (call
// de 2 pessoas) não há votação.
const (
	// VoteWindow: quanto tempo a votação fica aberta.
	VoteWindow = 60 * time.Second
	// voteCooldown: a mesma pessoa só abre outra votação depois disso.
	voteCooldown = 30 * time.Second
	minVoters    = 2
)

// Situação da votação.
const (
	VoteOpen    = "open"
	VotePassed  = "passed"
	VoteFailed  = "failed"
	VoteExpired = "expired"
)

// Vote é a votação como os apps recebem (castigo:vote).
type Vote struct {
	ID          string    `json:"id"`
	CallID      string    `json:"call_id"`
	ServerID    string    `json:"server_id"`
	TargetID    string    `json:"target_id"`
	InitiatorID string    `json:"initiator_id"`
	Effects     Effects   `json:"effects"`
	Duration    int       `json:"duration"`
	Voters      []string  `json:"voters"`
	Yes         []string  `json:"yes"`
	No          []string  `json:"no"`
	Needed      int       `json:"needed"`
	ExpiresAt   time.Time `json:"expires_at"`
	Status      string    `json:"status"`
	channelID   string
}

// needed: mais da metade dos votantes.
func needed(voters int) int { return voters/2 + 1 }

// eligibleVoters: os membros do servidor na call, menos o alvo.
func eligibleVoters(snap *permission.Snapshot, participants []string, targetID string) []string {
	out := []string{}
	for _, id := range participants {
		if id != targetID && snap.IsMember(id) {
			out = append(out, id)
		}
	}
	slices.Sort(out)
	return out
}

// ballot registra o voto de userID (um por pessoa, sem trocar).
func (v *Vote) ballot(userID string, yes bool) error {
	if !slices.Contains(v.Voters, userID) {
		return ErrNotVoter
	}
	if slices.Contains(v.Yes, userID) || slices.Contains(v.No, userID) {
		return ErrAlreadyVoted
	}
	if yes {
		v.Yes = append(v.Yes, userID)
	} else {
		v.No = append(v.No, userID)
	}
	return nil
}

// settle: passou (maioria sim), falhou (o sim não chega mais lá) ou segue aberta.
func (v *Vote) settle() string {
	switch {
	case len(v.Yes) >= v.Needed:
		return VotePassed
	case len(v.Voters)-len(v.No) < v.Needed:
		return VoteFailed
	}
	return VoteOpen
}

// copyOf: uma cópia que dá para mandar fora do lock.
func (v *Vote) copyOf() Vote {
	c := *v
	c.Voters, c.Yes, c.No = slices.Clone(v.Voters), slices.Clone(v.Yes), slices.Clone(v.No)
	return c
}

// voteBook: as votações abertas (uma por call), só em memória: um reinício
// do servidor perde a votação, e quem quiser abre outra.
type voteBook struct {
	mu     sync.Mutex
	byCall map[string]*Vote
	lastBy map[string]time.Time
}

func newVoteBook() *voteBook {
	return &voteBook{byCall: map[string]*Vote{}, lastBy: map[string]time.Time{}}
}

// open abre a votação com o voto sim de quem abriu.
func (b *voteBook) open(v *Vote, now time.Time) (Vote, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	if _, busy := b.byCall[v.CallID]; busy {
		return Vote{}, ErrVoteOpen
	}
	if last, ok := b.lastBy[v.InitiatorID]; ok && now.Sub(last) < voteCooldown {
		return Vote{}, ErrVoteCooldown
	}
	v.ID, v.Status, v.Needed, v.ExpiresAt = uuid.NewString(), VoteOpen, needed(len(v.Voters)), now.Add(VoteWindow)
	v.Yes, v.No = []string{v.InitiatorID}, []string{}
	b.byCall[v.CallID] = v
	b.lastBy[v.InitiatorID] = now
	return v.copyOf(), nil
}

// cast registra o voto e fecha a votação se ela se decidiu.
func (b *voteBook) cast(callID, voteID, userID string, yes bool, now time.Time) (Vote, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	v, ok := b.byCall[callID]
	if !ok || v.ID != voteID || !now.Before(v.ExpiresAt) {
		return Vote{}, ErrVoteNotFound
	}
	if err := v.ballot(userID, yes); err != nil {
		return Vote{}, err
	}
	if v.Status = v.settle(); v.Status != VoteOpen {
		delete(b.byCall, callID)
	}
	return v.copyOf(), nil
}

// expired fecha as votações que passaram do prazo.
func (b *voteBook) expired(now time.Time) []Vote {
	b.mu.Lock()
	defer b.mu.Unlock()
	var out []Vote
	for callID, v := range b.byCall {
		if !now.Before(v.ExpiresAt) {
			v.Status = VoteExpired
			out = append(out, v.copyOf())
			delete(b.byCall, callID)
		}
	}
	for userID, last := range b.lastBy {
		if now.Sub(last) >= voteCooldown {
			delete(b.lastBy, userID)
		}
	}
	return out
}

// current: a votação aberta na call (ok=false se não há).
func (b *voteBook) current(callID string) (Vote, bool) {
	b.mu.Lock()
	defer b.mu.Unlock()
	v, ok := b.byCall[callID]
	if !ok {
		return Vote{}, false
	}
	return v.copyOf(), true
}
