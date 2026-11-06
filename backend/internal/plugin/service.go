package plugin

import (
	"context"
	"log"

	"gin-quickstart/backend/internal/permission"
	"gin-quickstart/backend/internal/platform/wsevent"

	"github.com/google/uuid"
)

// PermissionChecker é o que o service usa do permission.Service.
type PermissionChecker interface {
	Require(ctx context.Context, serverID, userID string, want int64) error
	ServerPerms(ctx context.Context, serverID, userID string) (int64, error)
}

// Publisher entrega eventos em tempo real a uma sala do Hub.
type Publisher interface {
	BroadcastToRoom(room string, event []byte)
}

type store interface {
	Create(ctx context.Context, authorID string, d Draft) (Plugin, error)
	Get(ctx context.Context, id string) (Plugin, error)
	List(ctx context.Context, includeAll bool) ([]Plugin, error)
	SetReview(ctx context.Context, id string, status Status, note *string, reviewerID string) (Plugin, error)
	Install(ctx context.Context, serverID, pluginID, userID string) error
	Uninstall(ctx context.Context, serverID, pluginID string) error
	ListServer(ctx context.Context, serverID, userID string) ([]ServerPlugin, error)
	SetEnabled(ctx context.Context, serverID, userID, pluginID string, on bool) error
	ServersWith(ctx context.Context, pluginID string) ([]string, error)
}

// Service reúne as regras de aprovação, instalação e escolha do membro.
type Service struct {
	store store
	perms PermissionChecker
	pub   Publisher
	tech  map[string]struct{}
}

func NewService(store store, perms PermissionChecker, pub Publisher, techIDs []string) *Service {
	tech := make(map[string]struct{}, len(techIDs))
	for _, id := range techIDs {
		tech[id] = struct{}{}
	}
	return &Service{store: store, perms: perms, pub: pub, tech: tech}
}

func (s *Service) isTech(userID string) bool {
	_, ok := s.tech[userID]
	return ok
}

// Create valida e grava a ficha como pendente.
func (s *Service) Create(ctx context.Context, userID string, d Draft) (Plugin, error) {
	d, err := ValidateDraft(d)
	if err != nil {
		return Plugin{}, err
	}
	return s.store.Create(ctx, userID, d)
}

// Review registra a decisão do time e avisa os servidores que têm o plugin.
func (s *Service) Review(ctx context.Context, userID, pluginID string, to Status, note *string) (Plugin, error) {
	if !s.isTech(userID) {
		return Plugin{}, ErrForbidden
	}
	if err := checkPluginID(pluginID); err != nil {
		return Plugin{}, err
	}
	cur, err := s.store.Get(ctx, pluginID)
	if err != nil {
		return Plugin{}, err
	}
	if !CanTransition(cur.Status, to) {
		return Plugin{}, ErrInvalidTransition
	}
	if err := ValidateNote(cur.Status, to, note); err != nil {
		return Plugin{}, err
	}
	p, err := s.store.SetReview(ctx, pluginID, to, note, userID)
	if err != nil {
		return Plugin{}, err
	}
	servers, err := s.store.ServersWith(ctx, pluginID)
	if err != nil {
		// A decisão já foi salva: refazer cairia em ErrInvalidTransition.
		log.Printf("plugin: revisão de %s salva, mas listar servidores falhou: %v", pluginID, err)
		return p, nil
	}
	for _, id := range servers {
		s.emit("server:"+id, id)
	}
	return p, nil
}

// Catalog: o time vê todas as fichas; os outros, só as aprovadas.
func (s *Service) Catalog(ctx context.Context, userID string) ([]Plugin, error) {
	list, err := s.store.List(ctx, s.isTech(userID))
	if err != nil {
		return nil, err
	}
	if list == nil {
		list = []Plugin{}
	}
	return list, nil
}

// ServerPlugins lista os plugins do servidor para um membro.
func (s *Service) ServerPlugins(ctx context.Context, serverID, userID string) ([]ServerPlugin, error) {
	if err := checkServerID(serverID); err != nil {
		return nil, err
	}
	if _, err := s.perms.ServerPerms(ctx, serverID, userID); err != nil {
		return nil, err
	}
	list, err := s.store.ListServer(ctx, serverID, userID)
	if err != nil {
		return nil, err
	}
	if list == nil {
		list = []ServerPlugin{}
	}
	return list, nil
}

// Install liga um plugin aprovado ao servidor.
func (s *Service) Install(ctx context.Context, serverID, userID, pluginID string) error {
	if err := checkIDs(serverID, pluginID); err != nil {
		return err
	}
	if err := s.perms.Require(ctx, serverID, userID, permission.ManageServer); err != nil {
		return err
	}
	p, err := s.store.Get(ctx, pluginID)
	if err != nil {
		return err
	}
	if p.Status != StatusApproved {
		return ErrNotApproved
	}
	if err := s.store.Install(ctx, serverID, pluginID, userID); err != nil {
		return err
	}
	s.emit("server:"+serverID, serverID)
	return nil
}

// Uninstall tira o plugin do servidor (e as escolhas dos membros); ficha inexistente dá ErrNotFound.
func (s *Service) Uninstall(ctx context.Context, serverID, userID, pluginID string) error {
	if err := checkIDs(serverID, pluginID); err != nil {
		return err
	}
	if err := s.perms.Require(ctx, serverID, userID, permission.ManageServer); err != nil {
		return err
	}
	if _, err := s.store.Get(ctx, pluginID); err != nil {
		return err
	}
	if err := s.store.Uninstall(ctx, serverID, pluginID); err != nil {
		return err
	}
	s.emit("server:"+serverID, serverID)
	return nil
}

// SetEnabled grava a escolha do membro e avisa só os apps dele.
func (s *Service) SetEnabled(ctx context.Context, serverID, userID, pluginID string, on bool) error {
	if err := checkIDs(serverID, pluginID); err != nil {
		return err
	}
	if _, err := s.perms.ServerPerms(ctx, serverID, userID); err != nil {
		return err
	}
	if err := s.store.SetEnabled(ctx, serverID, userID, pluginID, on); err != nil {
		return err
	}
	s.emit("user:"+userID, serverID)
	return nil
}

func (s *Service) emit(room, serverID string) {
	s.pub.BroadcastToRoom(room, wsevent.Marshal(EventChanged, map[string]string{"server_id": serverID}))
}

// checkServerID trata id que não é UUID como servidor onde o usuário não está.
func checkServerID(id string) error {
	if uuid.Validate(id) != nil {
		return permission.ErrNotMember
	}
	return nil
}

func checkPluginID(id string) error {
	if uuid.Validate(id) != nil {
		return ErrNotFound
	}
	return nil
}

func checkIDs(serverID, pluginID string) error {
	if err := checkServerID(serverID); err != nil {
		return err
	}
	return checkPluginID(pluginID)
}
