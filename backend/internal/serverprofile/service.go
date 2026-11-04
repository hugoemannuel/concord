package serverprofile

import (
	"context"
	"sync"
	"time"

	"gin-quickstart/backend/internal/audit"
)

// cardCountsTTL: a contagem de quem está fora fica guardada esse tempo (quem só
// tem o id ou o link não acompanha o "online" segundo a segundo). O mesmo prazo
// da prévia do convite.
const cardCountsTTL = 45 * time.Second

// offlineStatus é o status que o hub devolve para quem não está (ou está invisível).
const offlineStatus = "offline"

// EditFunc recebe o perfil atual e devolve o novo e se os membros têm de
// reaplicar a tag. Roda dentro da transação da edição.
type EditFunc func(before Profile) (next Profile, resetTag bool, err error)

// Store é o que o serviço usa do banco.
type Store interface {
	Profile(ctx context.Context, serverID string) (Profile, error)
	// ServerFacts: nil se o servidor não existe.
	ServerFacts(ctx context.Context, serverID string) (*Facts, error)
	CanSeePrivate(ctx context.Context, serverID, userID string) (member, invited bool, err error)
	// Edit roda edit numa transação, com a linha travada; devolve antes e depois.
	Edit(ctx context.Context, serverID string, edit EditFunc) (before, after Profile, err error)
}

// PresenceLookup: o status que os outros veem de cada id (websocket.Hub.PresenceMap).
type PresenceLookup func(userIDs []string) map[string]string

// InviteResolver: o servidor de um código de convite (ErrInvalidInvite se não vale).
type InviteResolver func(ctx context.Context, code string) (serverID string, err error)

// AuditRecorder grava no registro de auditoria do servidor (audit.Recorder).
type AuditRecorder interface {
	Record(ctx context.Context, e audit.Event)
}

// Publisher avisa quem está online (websocket.Hub).
type Publisher interface {
	PublishServerProfile(e ProfileEvent)
	PublishServerTag(e TagEvent)
	PublishUserServerTag(e UserTagEvent)
}

// ProfileEvent vai para quem está no servidor.
type ProfileEvent struct {
	ServerID string  `json:"server_id"`
	Profile  Profile `json:"profile"`
}

// TagEvent vai para todo mundo (a tag aparece em qualquer lugar): diz só que a tag
// do servidor mudou, sem levá-la, porque o servidor pode ser privado. Quem guardou
// a tag de alguém desse servidor pergunta de novo.
type TagEvent struct {
	ServerID string `json:"server_id"`
}

// UserTagEvent: a tag de uma pessoa mudou. LeftServerID: ela saiu desse servidor
// (quem guardou a tag dela confere se era a dele).
type UserTagEvent struct {
	UserID       string `json:"user_id"`
	Tag          *Tag   `json:"tag"`
	LeftServerID string `json:"left_server_id,omitempty"`
}

// Service monta o cartão e aplica as edições do perfil.
type Service struct {
	store     Store
	publisher Publisher
	presence  PresenceLookup
	resolve   InviteResolver
	audit     AuditRecorder
	counts    *countCache
}

func NewService(store Store, publisher Publisher, presence PresenceLookup) *Service {
	return &Service{store: store, publisher: publisher, presence: presence, counts: newCountCache(cardCountsTTL)}
}

// SetInviteResolver liga a leitura do código de convite (no boot).
func (s *Service) SetInviteResolver(resolve InviteResolver) { s.resolve = resolve }

// SetAudit liga o registro de auditoria (no boot).
func (s *Service) SetAudit(r AuditRecorder) { s.audit = r }

// Card é o cartão como viewerID pode ver. inviteCode: o código do link, quando
// a pessoa chegou por ele (só vale o do próprio servidor).
func (s *Service) Card(ctx context.Context, serverID, viewerID, inviteCode string) (*Card, error) {
	facts, err := s.store.ServerFacts(ctx, serverID)
	if err != nil {
		return nil, err
	}
	profile, err := s.store.Profile(ctx, serverID)
	if err != nil {
		return nil, err
	}
	locked := &Card{ServerID: serverID, Locked: true}
	if facts == nil {
		return locked, nil
	}
	member, invited, err := s.store.CanSeePrivate(ctx, serverID, viewerID)
	if err != nil {
		return nil, err
	}
	if profile.Private && !member && !invited && !s.codeOpens(ctx, serverID, inviteCode) {
		return locked, nil
	}
	return s.buildCard(serverID, facts, profile, member), nil
}

// codeOpens: o código é mesmo deste servidor.
func (s *Service) codeOpens(ctx context.Context, serverID, code string) bool {
	if code == "" || s.resolve == nil {
		return false
	}
	resolved, err := s.resolve(ctx, code)
	return err == nil && resolved == serverID
}

// CardByInvite é o cartão da prévia do convite: quem tem o link vê o perfil,
// mesmo privado. Anônimo não recebe o id do servidor.
func (s *Service) CardByInvite(ctx context.Context, code, viewerID string) (*Card, error) {
	if s.resolve == nil {
		return nil, ErrInvalidInvite
	}
	serverID, err := s.resolve(ctx, code)
	if err != nil {
		return nil, err
	}
	card, err := s.Card(ctx, serverID, viewerID, code)
	if err != nil {
		return nil, err
	}
	if viewerID == "" {
		card.ServerID = ""
	}
	return card, nil
}

func (s *Service) buildCard(serverID string, facts *Facts, profile Profile, member bool) *Card {
	card := &Card{
		ServerID:  serverID,
		Name:      facts.Name,
		IconURL:   facts.IconURL,
		CreatedAt: &facts.CreatedAt,
		IsMember:  member,
		Profile:   &profile,
	}
	if member {
		card.MemberCount, card.OnlineCount = len(facts.MemberIDs), s.countOnline(facts.MemberIDs)
		return card
	}
	// A faixa e o fundo são de quem está no servidor.
	profile.Strip, profile.Theme = Art{}, Theme{}
	counts := s.counts.get(serverID, func() cardCounts {
		return cardCounts{members: len(facts.MemberIDs), online: s.countOnline(facts.MemberIDs)}
	})
	card.MemberCount, card.OnlineCount = counts.members, counts.online
	return card
}

func (s *Service) countOnline(ids []string) int {
	if s.presence == nil {
		return 0
	}
	online := 0
	for _, status := range s.presence(ids) {
		if status != offlineStatus {
			online++
		}
	}
	return online
}

// Update aplica a edição (quem chama já conferiu MANAGE_SERVER), avisa quem
// está online e grava na auditoria.
func (s *Service) Update(ctx context.Context, serverID, actorID string, patch Patch) (*Card, error) {
	var change Change
	before, after, err := s.store.Edit(ctx, serverID, func(current Profile) (Profile, bool, error) {
		next, c, err := applyPatch(current, serverID, patch)
		change = c
		return next, c.TagReset, err
	})
	if err != nil {
		return nil, err
	}
	facts, err := s.store.ServerFacts(ctx, serverID)
	if err != nil {
		return nil, err
	}
	s.announce(serverID, after, change)
	if facts == nil {
		return &Card{ServerID: serverID, Locked: true}, nil
	}
	s.recordUpdate(ctx, serverID, actorID, facts.Name, before, after)
	return s.buildCard(serverID, facts, after, true), nil
}

func (s *Service) announce(serverID string, after Profile, change Change) {
	if s.publisher == nil {
		return
	}
	s.publisher.PublishServerProfile(ProfileEvent{ServerID: serverID, Profile: after})
	if change.TagChanged {
		s.publisher.PublishServerTag(TagEvent{ServerID: serverID})
	}
}

// cardCounts é a contagem guardada de um servidor.
type cardCounts struct {
	members, online int
	expiresAt       time.Time
}

// countCache guarda a contagem que quem está fora vê, por ttl (uma entrada por
// servidor; os vencidos saem quando alguém pede de novo).
type countCache struct {
	mu      sync.Mutex
	ttl     time.Duration
	entries map[string]cardCounts
	now     func() time.Time
}

func newCountCache(ttl time.Duration) *countCache {
	return &countCache{ttl: ttl, entries: map[string]cardCounts{}, now: time.Now}
}

func (c *countCache) get(serverID string, load func() cardCounts) cardCounts {
	c.mu.Lock()
	defer c.mu.Unlock()
	now := c.now()
	if entry, ok := c.entries[serverID]; ok && now.Before(entry.expiresAt) {
		return entry
	}
	for id, entry := range c.entries {
		if !now.Before(entry.expiresAt) {
			delete(c.entries, id)
		}
	}
	entry := load()
	entry.expiresAt = now.Add(c.ttl)
	c.entries[serverID] = entry
	return entry
}
