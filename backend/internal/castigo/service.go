package castigo

import (
	"context"
	"log"
	"time"

	"gin-quickstart/backend/internal/call"
	"gin-quickstart/backend/internal/permission"
	"gin-quickstart/backend/internal/platform/wsevent"
)

// store é o que o Service usa do Repository (nos testes, um fake em memória).
type store interface {
	Save(ctx context.Context, c Castigo) error
	Delete(ctx context.Context, serverID, userID string) error
	Active(ctx context.Context, now time.Time) ([]Castigo, error)
	DeleteExpired(ctx context.Context, now time.Time) error
}

// PermissionSource: as permissões do servidor (permission.Service).
type PermissionSource interface {
	Snapshot(ctx context.Context, serverID string) (*permission.Snapshot, error)
}

// Calls: quem está em qual call e como aplicar o castigo na hora (call.Service).
type Calls interface {
	VoiceLocationOf(userID string) (call.VoiceLocation, bool)
	ParticipantIDs(callID string) []string
	EnforceCastigo(ctx context.Context, serverID, userID string)
}

// Publisher entrega os eventos (websocket.Hub).
type Publisher interface {
	BroadcastToRoom(room string, event []byte)
	BroadcastToCall(callID string, event []byte)
}

type Service struct {
	store  store
	perms  PermissionSource
	calls  Calls
	pub    Publisher
	audit  AuditRecorder
	now    func() time.Time
	active *index
	votes  *voteBook
}

func NewService(st store, perms PermissionSource, calls Calls, pub Publisher) *Service {
	return &Service{store: st, perms: perms, calls: calls, pub: pub, now: time.Now, active: newIndex(), votes: newVoteBook()}
}

// Request: o castigo pedido (direto ou na votação). Duration em segundos.
type Request struct {
	UserID   string  `json:"user_id"`
	Effects  Effects `json:"effects"`
	Duration int     `json:"duration"`
}

// valid: o prazo, se o pedido tem efeito e duração permitidos.
func (r Request) valid() (time.Duration, error) {
	d, ok := duration(r.Duration)
	if !ok || !r.Effects.any() || r.UserID == "" {
		return 0, ErrInvalid
	}
	return d, nil
}

// Warm carrega os castigos que ainda valem (na subida do servidor).
func (s *Service) Warm(ctx context.Context) error {
	now := s.now()
	if err := s.store.DeleteExpired(ctx, now); err != nil {
		log.Printf("[castigo] apagar vencidos: %v", err)
	}
	list, err := s.store.Active(ctx, now)
	if err != nil {
		return err
	}
	for _, c := range list {
		s.active.put(c.pruned(now))
	}
	return nil
}

// --- consultas da chamada (call.CastigoSource) ---

// Restriction: o que o castigo tira de userID no servidor agora.
func (s *Service) Restriction(serverID, userID string) call.Restriction {
	c, _ := s.active.get(serverID, userID)
	return c.restriction(s.now())
}

// Punished: userID tem castigo em algum servidor.
func (s *Service) Punished(userID string) bool { return s.active.any(userID) }

// --- castigo direto ---

// checkTarget: os dois são membros, ninguém castiga a si mesmo nem o dono.
func checkTarget(snap *permission.Snapshot, actorID, targetID string) error {
	switch {
	case !snap.IsMember(actorID), !snap.IsMember(targetID):
		return ErrNotMember
	case actorID == targetID:
		return ErrSelf
	case snap.IsOwner(targetID):
		return ErrOwner
	}
	return nil
}

// authorizeDirect: castigar (ou tirar o castigo) sem votação pede a
// moderação de voz de cada efeito no servidor e estar acima do alvo.
func authorizeDirect(snap *permission.Snapshot, actorID, targetID string, e Effects) error {
	if err := checkTarget(snap, actorID, targetID); err != nil {
		return err
	}
	if !permission.Has(snap.Server(actorID), e.perms()) {
		return ErrMissingPerm
	}
	if !snap.CanActOn(actorID, targetID) {
		return ErrCannotActOn
	}
	return nil
}

func (s *Service) snapshot(ctx context.Context, serverID string) (*permission.Snapshot, error) {
	snap, err := s.perms.Snapshot(ctx, serverID)
	if err != nil {
		return nil, ErrNotMember
	}
	return snap, nil
}

// Apply castiga direto (quem tem a moderação de voz de cada efeito).
func (s *Service) Apply(ctx context.Context, serverID, actorID string, req Request) (Castigo, error) {
	d, err := req.valid()
	if err != nil {
		return Castigo{}, err
	}
	snap, err := s.snapshot(ctx, serverID)
	if err != nil {
		return Castigo{}, err
	}
	if err := authorizeDirect(snap, actorID, req.UserID, req.Effects); err != nil {
		return Castigo{}, err
	}
	return s.punish(ctx, punishment{serverID: serverID, actorID: actorID, req: req, d: d})
}

// punishment: um castigo que vai valer (direto ou aprovado na votação).
type punishment struct {
	serverID, actorID, channelID string
	req                          Request
	d                            time.Duration
	byVote                       bool
}

// punish soma o castigo ao que a pessoa já tinha, grava, avisa o servidor e
// aplica na call em que ela estiver.
func (s *Service) punish(ctx context.Context, p punishment) (Castigo, error) {
	now := s.now()
	c, ok := s.active.get(p.serverID, p.req.UserID)
	if !ok {
		c = Castigo{ServerID: p.serverID, UserID: p.req.UserID}
	}
	c = c.pruned(now).with(p.req.Effects, now.Add(p.d))
	if err := s.store.Save(ctx, c); err != nil {
		return Castigo{}, err
	}
	s.active.put(c)
	s.changed(ctx, c)
	s.record(ctx, applyEvent(p))
	return c, nil
}

// changed avisa o servidor e aplica o castigo (ou o fim dele) na mídia.
func (s *Service) changed(ctx context.Context, c Castigo) {
	s.pub.BroadcastToRoom("server:"+c.ServerID, wsevent.Marshal("castigo:update", c))
	s.calls.EnforceCastigo(ctx, c.ServerID, c.UserID)
}

// Lift tira o castigo antes da hora (a mesma moderação de aplicar direto).
func (s *Service) Lift(ctx context.Context, serverID, actorID, targetID string) error {
	c, ok := s.active.get(serverID, targetID)
	if !ok || !c.active(s.now()) {
		return ErrNotFound
	}
	snap, err := s.snapshot(ctx, serverID)
	if err != nil {
		return err
	}
	if err := authorizeDirect(snap, actorID, targetID, c.effects(s.now())); err != nil {
		return err
	}
	if err := s.store.Delete(ctx, serverID, targetID); err != nil {
		return err
	}
	s.active.remove(serverID, targetID)
	s.changed(ctx, Castigo{ServerID: serverID, UserID: targetID})
	s.record(ctx, liftEvent(serverID, actorID, targetID))
	return nil
}

// List: os castigos que valem agora no servidor (para os membros).
func (s *Service) List(ctx context.Context, serverID, viewerID string) ([]Castigo, error) {
	snap, err := s.snapshot(ctx, serverID)
	if err != nil {
		return nil, err
	}
	if !snap.IsMember(viewerID) {
		return nil, ErrNotMember
	}
	return s.active.ofServer(serverID, s.now()), nil
}
