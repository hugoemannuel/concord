package guest

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"time"

	"gin-quickstart/backend/internal/call"
	"gin-quickstart/backend/internal/channel"
	"gin-quickstart/backend/internal/permission"

	"github.com/google/uuid"
)

// store é o que o Service usa do Repository (nos testes, um fake em memória).
type store interface {
	CreateInvite(ctx context.Context, inv *Invite, tokenHash string) error
	InviteByHash(ctx context.Context, tokenHash string) (*Invite, error)
	InviteByID(ctx context.Context, id string) (*Invite, error)
	InvitesOfChannel(ctx context.Context, channelID string, now time.Time) ([]Invite, error)
	GuestsOf(ctx context.Context, inviteIDs []string) ([]InviteGuest, error)
	RevokeInvite(ctx context.Context, id string, now time.Time) error
	CreateGuestUser(ctx context.Context, u GuestUser) error
	CreatePass(ctx context.Context, p *Pass) error
	PassFor(ctx context.Context, inviteID, userID string) (*Pass, error)
	CountPasses(ctx context.Context, inviteID string) (int, error)
	MovePass(ctx context.Context, passID, channelID string) error
	EndPass(ctx context.Context, passID string, now time.Time) error
	ActivePasses(ctx context.Context, now time.Time) ([]Pass, error)
	DeleteStaleGuests(ctx context.Context, before time.Time) (int64, error)
}

// PermissionSource: as permissões do servidor (permission.Service).
type PermissionSource interface {
	Snapshot(ctx context.Context, serverID string) (*permission.Snapshot, error)
}

// Directory: nomes e regras de outros domínios que o convite mostra ou confere.
type Directory interface {
	Channel(ctx context.Context, id string) (*channel.Channel, error)
	Server(ctx context.Context, id string) ServerInfo
	DisplayName(ctx context.Context, userID string) string
	IsBanned(ctx context.Context, serverID, userID string) bool
}

// Calls: onde a pessoa está em voz e como tirá-la das calls (call.Service).
type Calls interface {
	VoiceLocationOf(userID string) (call.VoiceLocation, bool)
	RemoveFromServerCalls(ctx context.Context, serverID, userID string)
	// GuestBecameMember: o visitante virou membro e segue na call como membro.
	GuestBecameMember(ctx context.Context, serverID, userID string)
}

// Notifier manda um evento só para o usuário (websocket.Hub).
type Notifier interface {
	SendToUser(userID string, event []byte)
}

// Tokens emite a sessão do visitante sem conta (auth.Service).
type Tokens interface {
	GenerateGuestToken(userID string, until time.Time) (string, error)
}

type Service struct {
	store  store
	perms  PermissionSource
	dir    Directory
	calls  Calls
	notify Notifier
	tokens Tokens
	now    func() time.Time
	active *index
	audit  AuditRecorder
}

func NewService(st store, perms PermissionSource, dir Directory, calls Calls, notify Notifier, tokens Tokens) *Service {
	return &Service{store: st, perms: perms, dir: dir, calls: calls, notify: notify, tokens: tokens, now: time.Now, active: newIndex()}
}

// Warm carrega os acessos ativos do banco (na subida do servidor).
func (s *Service) Warm(ctx context.Context) error {
	passes, err := s.store.ActivePasses(ctx, s.now())
	if err != nil {
		return err
	}
	for _, p := range passes {
		s.active.put(p)
	}
	return nil
}

// --- consultas da chamada (call.GuestAccess) ---

// GuestChannelPerms: as permissões do visitante no canal permitido.
func (s *Service) GuestChannelPerms(_ context.Context, channelID, userID string) (int64, bool) {
	p, ok := s.active.inChannel(userID, channelID, s.now())
	if !ok {
		return 0, false
	}
	return p.channelPerms(), true
}

// GuestOf: o servidor em que o usuário é visitante agora ("" se não é).
func (s *Service) GuestOf(userID string) string {
	p, _ := s.active.latest(userID, s.now())
	return p.ServerID
}

// HasGuestPass: o usuário tem acesso de visitante ativo no servidor (a mesa de
// áudio da call mostra os sons de lá).
func (s *Service) HasGuestPass(serverID, userID string) bool {
	_, ok := s.active.inServer(userID, serverID, s.now())
	return ok
}

// MoveGuest: um moderador moveu o visitante; o canal de destino passa a ser o
// permitido (o anterior deixa de valer).
func (s *Service) MoveGuest(ctx context.Context, userID, serverID, channelID string) bool {
	p, ok := s.active.inServer(userID, serverID, s.now())
	if !ok {
		return false
	}
	if err := s.store.MovePass(ctx, p.ID, channelID); err != nil {
		log.Printf("[guest] mover acesso %s para %s falhou: %v", p.ID, channelID, err)
		return false
	}
	s.active.moveTo(userID, serverID, channelID)
	p.ChannelID = channelID
	s.announce(ctx, p)
	return true
}

// --- fim do acesso ---

// end encerra o acesso: grava, tira das calls do servidor e avisa o visitante.
func (s *Service) end(ctx context.Context, p Pass, reason string) {
	s.close(ctx, p)
	s.calls.RemoveFromServerCalls(ctx, p.ServerID, p.UserID)
	s.notify.SendToUser(p.UserID, endedEvent(p.ServerID, reason))
}

// announce manda o acesso (novo ou com o canal trocado) aos apps do usuário:
// o trilho de visitas e a tela da call se atualizam em todos eles.
func (s *Service) announce(ctx context.Context, p Pass) PassView {
	view := s.passView(ctx, p)
	data, _ := json.Marshal(map[string]any{"type": "guest:pass", "payload": view})
	s.notify.SendToUser(p.UserID, data)
	return view
}

func endedEvent(serverID, reason string) []byte {
	data, _ := json.Marshal(map[string]any{"type": "guest:ended", "payload": EndedEvent{ServerID: serverID, Reason: reason}})
	return data
}

// Sweep encerra os acessos vencidos e apaga os usuários de visitante que já
// não servem para nada (uma hora depois do fim).
func (s *Service) Sweep(ctx context.Context) {
	now := s.now()
	for _, p := range s.active.matching(func(p Pass) bool { return !now.Before(p.ExpiresAt) }) {
		s.end(ctx, p, EndExpired)
	}
	if n, err := s.store.DeleteStaleGuests(ctx, now.Add(-time.Hour)); err != nil {
		log.Printf("[guest] limpar visitantes falhou: %v", err)
	} else if n > 0 {
		log.Printf("[guest] %d visitante(s) sem acesso apagado(s)", n)
	}
}

// RunSweeper roda o Sweep a cada intervalo até ctx acabar.
func (s *Service) RunSweeper(ctx context.Context, every time.Duration) {
	ticker := time.NewTicker(every)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			s.Sweep(ctx)
		}
	}
}

// --- abrir o link ---

// openInvite acha o convite pelo token e confere que ainda abre.
func (s *Service) openInvite(ctx context.Context, token string) (*Invite, error) {
	if !validToken(token) {
		return nil, ErrNotFound
	}
	inv, err := s.store.InviteByHash(ctx, hashToken(token))
	if err != nil || !inv.usable(s.now()) {
		return nil, ErrNotFound
	}
	return inv, nil
}

// newPass cria o acesso de userID pelo convite, respeitando o limite de pessoas.
func (s *Service) newPass(ctx context.Context, inv *Invite, userID string) (Pass, error) {
	n, err := s.store.CountPasses(ctx, inv.ID)
	if err != nil {
		return Pass{}, err
	}
	if n >= MaxGuestsPerInvite {
		return Pass{}, ErrInviteFull
	}
	p := Pass{
		ID:          uuid.NewString(),
		InviteID:    inv.ID,
		UserID:      userID,
		ServerID:    inv.ServerID,
		ChannelID:   inv.ChannelID,
		Permissions: inv.Permissions,
		ExpiresAt:   inv.ExpiresAt,
	}
	if err := s.store.CreatePass(ctx, &p); err != nil {
		return Pass{}, err
	}
	s.active.put(p)
	return p, nil
}

// JoinAsGuest: quem não tem conta digita um nome e entra. Cria o usuário
// efêmero, o acesso e a sessão (token de visitante até o fim do prazo).
func (s *Service) JoinAsGuest(ctx context.Context, token, rawName string) (*Session, error) {
	name, err := normalizeDisplayName(rawName)
	if err != nil {
		return nil, err
	}
	inv, err := s.openInvite(ctx, token)
	if err != nil {
		return nil, err
	}
	u := newGuestUser(name)
	if err := s.store.CreateGuestUser(ctx, u); err != nil {
		return nil, err
	}
	p, err := s.newPass(ctx, inv, u.ID)
	if err != nil {
		return nil, err
	}
	sessionToken, err := s.tokens.GenerateGuestToken(u.ID, p.ExpiresAt)
	if err != nil {
		return nil, err
	}
	return &Session{Token: sessionToken, User: SessionUser{ID: u.ID, Username: u.Username, DisplayName: u.DisplayName}, Pass: s.passView(ctx, p)}, nil
}

// JoinWithAccount: quem tem conta e está logado entra com ela, sem virar
// membro. Voltar pelo mesmo link reaproveita o acesso (se não foi encerrado).
func (s *Service) JoinWithAccount(ctx context.Context, token, userID string) (*PassView, error) {
	inv, err := s.openInvite(ctx, token)
	if err != nil {
		return nil, err
	}
	if err := s.accountCanJoin(ctx, inv, userID); err != nil {
		// Já é membro: o app abre o canal normalmente (precisa saber qual).
		target := PassView{ServerID: inv.ServerID, ChannelID: inv.ChannelID}
		return &target, err
	}
	p, err := s.accountPass(ctx, inv, userID)
	if err != nil {
		return nil, err
	}
	view := s.announce(ctx, p)
	return &view, nil
}

// accountCanJoin: membro não precisa de convite; banido não entra.
func (s *Service) accountCanJoin(ctx context.Context, inv *Invite, userID string) error {
	snap, err := s.perms.Snapshot(ctx, inv.ServerID)
	if err != nil {
		return err
	}
	if snap.IsMember(userID) {
		return ErrAlreadyMember
	}
	if s.dir.IsBanned(ctx, inv.ServerID, userID) {
		return ErrNotFound
	}
	return nil
}

// accountPass: o acesso que a conta já tinha por este link, ou um novo.
func (s *Service) accountPass(ctx context.Context, inv *Invite, userID string) (Pass, error) {
	existing, err := s.store.PassFor(ctx, inv.ID, userID)
	if errors.Is(err, ErrNotFound) {
		return s.newPass(ctx, inv, userID)
	}
	if err != nil {
		return Pass{}, err
	}
	if existing.EndedAt != nil {
		return Pass{}, ErrAccessEnded
	}
	s.active.put(*existing)
	return *existing, nil
}

// Passes: os acessos ativos do usuário (a tela do visitante descobre em que
// canal está — depois de movido, por exemplo — e até quando).
func (s *Service) Passes(ctx context.Context, userID string) []PassView {
	now := s.now()
	views := []PassView{}
	for _, p := range s.active.matching(func(p Pass) bool { return p.UserID == userID && now.Before(p.ExpiresAt) }) {
		views = append(views, s.passView(ctx, p))
	}
	return views
}
