package channel

import (
	"context"
	"errors"

	"gin-quickstart/backend/internal/permission"

	"github.com/google/uuid"
)

var (
	ErrNameRequired    = errors.New("name is required")
	ErrChannelNotFound = errors.New("channel not found")
	ErrSystemChannel   = errors.New("system channel cannot be changed")
)

type EventPublisher interface {
	PublishChannelCreate(event CreateEvent)
	PublishChannelUpdate(event CreateEvent)
	PublishChannelDelete(event DeleteEvent)
	PublishChannelReorder(event ReorderEvent)
	// PublishPermissionsChanged: quem vê o quê mudou (o app busca os canais
	// de novo e o servidor tira das salas quem perdeu acesso).
	PublishPermissionsChanged(serverID string)
}

// store é o que o Service usa do Repository (nos testes, um fake em memória).
type store interface {
	Create(ctx context.Context, ch *Channel, overwrites []permission.Overwrite) error
	FindByID(ctx context.Context, id string) (*Channel, error)
	FindSystemByServerID(ctx context.Context, serverID string) (*Channel, error)
	FindNoticesByServerID(ctx context.Context, serverID string) (*Channel, error)
	Update(ctx context.Context, id string, in UpdateInput) error
	Delete(ctx context.Context, id string) error
	ListByServerID(ctx context.Context, serverID string) ([]Channel, error)
	Reorder(ctx context.Context, serverID string, chType string, ids []string) error
	SetOverwrite(ctx context.Context, channelID string, o permission.Overwrite) error
	DeleteOverwrite(ctx context.Context, channelID, targetType, targetID string) error
}

type Service struct {
	repository store
	publisher  EventPublisher

	// Chamados quando o canal do Maestro nasce com um servidor novo.
	onSystemCreated []func(ctx context.Context, ch *Channel)
	// Chamados depois de editar um canal (o modo lento do message se atualiza).
	onUpdated []func(ctx context.Context, ch *Channel)

	// Aviso de sistema ao trocar o prazo das mensagens temporárias.
	noticePoster ChannelNoticePoster
	actorName    func(ctx context.Context, userID string) (string, error)
}

func ChannelService(repository *Repository, publisher EventPublisher) *Service {
	return newService(repository, publisher)
}

func newService(repository store, publisher EventPublisher) *Service {
	return &Service{
		repository: repository,
		publisher:  publisher,
	}
}

// Create cria o canal já com as sobrescritas (canal privado). O canal de
// sistema só nasce por CreateSystem/CreateNotices, nunca por pedido do cliente.
func (s *Service) Create(ctx context.Context, ch *Channel, overwrites ...permission.Overwrite) error {
	ch.IsSystem, ch.SystemKind = false, nil
	return s.create(ctx, ch, overwrites)
}

// CreateSystem cria o canal "musica" do servidor (usado na criação do servidor).
func (s *Service) CreateSystem(ctx context.Context, serverID, createdBy string) (*Channel, error) {
	ch := systemChannel(serverID, SystemChannelName, SystemKindMaestro, createdBy)
	if err := s.create(ctx, ch, nil); err != nil {
		return nil, err
	}
	s.notifySystemCreated(ctx, ch)
	return ch, nil
}

// CreateNotices cria o canal "avisos" do servidor (usado na criação do servidor).
func (s *Service) CreateNotices(ctx context.Context, serverID, createdBy string) (*Channel, error) {
	ch := systemChannel(serverID, NoticesChannelName, SystemKindNotices, createdBy)
	if err := s.create(ctx, ch, nil); err != nil {
		return nil, err
	}
	return ch, nil
}

// SystemChannel: o canal "musica" (do Maestro) do servidor (ErrChannelNotFound se não tem).
func (s *Service) SystemChannel(ctx context.Context, serverID string) (*Channel, error) {
	return s.repository.FindSystemByServerID(ctx, serverID)
}

// NoticesChannel: o canal "avisos" do servidor (ErrChannelNotFound se não tem).
func (s *Service) NoticesChannel(ctx context.Context, serverID string) (*Channel, error) {
	return s.repository.FindNoticesByServerID(ctx, serverID)
}

func (s *Service) create(ctx context.Context, ch *Channel, overwrites []permission.Overwrite) error {
	if ch.Name == "" {
		return ErrNameRequired
	}

	if ch.Type == "" {
		ch.Type = TypeText
	}

	ch.ID = uuid.New().String()

	if err := s.repository.Create(ctx, ch, overwrites); err != nil {
		return err
	}
	// As que o canal herdou da categoria já vêm preenchidas pelo repositório.
	ch.Overwrites = append(append([]permission.Overwrite{}, ch.Overwrites...), overwrites...)
	for i := range ch.Overwrites {
		ch.Overwrites[i].ChannelID = ch.ID
	}

	if s.publisher != nil {
		s.publisher.PublishChannelCreate(CreateEvent{
			ServerID: ch.ServerID,
			Channel:  *ch,
		})
	}

	return nil
}

func (s *Service) FindByID(ctx context.Context, id string) (*Channel, error) {
	return s.repository.FindByID(ctx, id)
}

// Update renomeia o canal e, se pedido, troca o modo lento.
func (s *Service) Update(ctx context.Context, id string, in UpdateInput) (*Channel, error) {
	if err := in.validate(); err != nil {
		return nil, err
	}

	ch, err := s.repository.FindByID(ctx, id)
	if err != nil {
		return nil, ErrChannelNotFound
	}
	if ch.IsSystem {
		return nil, ErrSystemChannel
	}

	if err := s.repository.Update(ctx, id, in); err != nil {
		return nil, err
	}

	updated, err := s.repository.FindByID(ctx, id)
	if err != nil {
		return nil, err
	}

	s.notifyUpdated(ctx, updated)
	return updated, nil
}

// OnUpdated registra quem quer saber de cada canal editado (no boot).
func (s *Service) OnUpdated(fn func(ctx context.Context, ch *Channel)) {
	s.onUpdated = append(s.onUpdated, fn)
}

// notifyUpdated publica o channel:update e chama os ganchos de OnUpdated.
func (s *Service) notifyUpdated(ctx context.Context, updated *Channel) {
	if s.publisher != nil {
		s.publisher.PublishChannelUpdate(CreateEvent{ServerID: updated.ServerID, Channel: *updated})
	}
	for _, fn := range s.onUpdated {
		fn(ctx, updated)
	}
}

func (s *Service) Delete(ctx context.Context, id string) error {
	ch, err := s.repository.FindByID(ctx, id)
	if err != nil {
		return ErrChannelNotFound
	}
	if ch.IsSystem {
		return ErrSystemChannel
	}

	if err := s.repository.Delete(ctx, id); err != nil {
		return err
	}

	if s.publisher != nil {
		s.publisher.PublishChannelDelete(DeleteEvent{
			ServerID:  ch.ServerID,
			ChannelID: id,
		})
	}

	return nil
}

// Reorder muda a ordem dos canais de um tipo (texto ou voz) do servidor; ids
// tem que ser exatamente os canais daquela seção. Avisa a sala do servidor.
func (s *Service) Reorder(ctx context.Context, serverID string, chType string, ids []string, requestID string) error {
	if chType != TypeText && chType != TypeVoice {
		return ErrInvalidType
	}
	if len(requestID) > MaxRequestIDLength {
		return ErrInvalidRequestID
	}
	if ids == nil {
		ids = []string{}
	}

	if err := s.repository.Reorder(ctx, serverID, chType, ids); err != nil {
		return err
	}

	if s.publisher != nil {
		s.publisher.PublishChannelReorder(ReorderEvent{
			ServerID:   serverID,
			Type:       chType,
			ChannelIDs: ids,
			RequestID:  requestID,
		})
	}

	return nil
}

func (s *Service) ListByServerID(ctx context.Context, serverID string) ([]Channel, error) {
	return s.repository.ListByServerID(ctx, serverID)
}

// SetOverwrite grava a sobrescrita e avisa o servidor (o canal muda para quem
// ganhou ou perdeu acesso).
func (s *Service) SetOverwrite(ctx context.Context, ch *Channel, o permission.Overwrite) error {
	if ch.IsSystem {
		return ErrSystemChannel
	}
	o.ChannelID = ch.ID
	if err := s.repository.SetOverwrite(ctx, ch.ID, o); err != nil {
		return err
	}
	s.publishPermissions(ch)
	return nil
}

func (s *Service) DeleteOverwrite(ctx context.Context, ch *Channel, targetType, targetID string) error {
	if ch.IsSystem {
		return ErrSystemChannel
	}
	if err := s.repository.DeleteOverwrite(ctx, ch.ID, targetType, targetID); err != nil {
		return err
	}
	s.publishPermissions(ch)
	return nil
}

func (s *Service) publishPermissions(ch *Channel) {
	if s.publisher == nil {
		return
	}
	s.publisher.PublishChannelUpdate(CreateEvent{ServerID: ch.ServerID, Channel: *ch})
	s.publisher.PublishPermissionsChanged(ch.ServerID)
}
