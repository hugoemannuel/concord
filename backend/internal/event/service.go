package event

import (
	"context"
	"fmt"
	"log"
	"slices"
	"time"

	"gin-quickstart/backend/internal/audit"

	"github.com/google/uuid"
)

// store é o que o service usa do repositório.
type store interface {
	Create(ctx context.Context, e *Event, reminders []ReminderRow) error
	Update(ctx context.Context, e *Event, reminders []ReminderRow) error
	UpdateBasics(ctx context.Context, e *Event) error
	Cancel(ctx context.Context, serverID, eventID string) error
	Find(ctx context.Context, serverID, eventID string) (*Event, error)
	ListUpcoming(ctx context.Context, serverID, userID string) ([]Event, error)
	SetRSVP(ctx context.Context, eventID, userID string, occurrence time.Time, going bool) error
	ClearRSVP(ctx context.Context, eventID, userID string, occurrence time.Time) error
	ListGoing(ctx context.Context, eventID string, occurrence time.Time) ([]Going, error)
}

// accessStore é a configuração do servidor: o que cada cargo pode fazer com os
// eventos (o dono decide). Quem usa só a checagem precisa de EventActions.
type accessStore interface {
	EventActions(ctx context.Context, serverID, userID string) (Actions, error)
	IsOwner(ctx context.Context, serverID, userID string) (bool, error)
	RoleAccessList(ctx context.Context, serverID string) ([]RoleAccess, error)
	SetRoleActions(ctx context.Context, serverID, roleID string, actions Actions) error
}

type memberChecker interface {
	IsMember(ctx context.Context, serverID, userID string) (bool, error)
}

type publisher interface {
	BroadcastToRoom(room string, event []byte)
}

// roomControl é o que o service pede às salas dos eventos (rooms.go).
type roomControl interface {
	Close(ctx context.Context, ref RoomRef) error
	Allow(ctx context.Context, e *Event, userID string, allowed bool)
}

// bannerFiles apaga o arquivo de um banner (media.Store).
type bannerFiles interface {
	Remove(name string) error
}

type Service struct {
	store   store
	access  accessStore
	members memberChecker
	pub     publisher
	now     func() time.Time
	rooms   roomControl
	banners bannerFiles
	audit   AuditRecorder
}

func NewService(s store, a accessStore, m memberChecker, pub publisher) *Service {
	return &Service{store: s, access: a, members: m, pub: pub, now: time.Now}
}

// WithBanners liga a remoção dos arquivos de banner que deixam de valer (sem
// ela, só a faxina periódica os apaga).
func (s *Service) WithBanners(b bannerFiles) *Service {
	s.banners = b
	return s
}

// WithRooms liga as salas próprias dos eventos (sem elas, cancelar e responder
// presença só mexem no evento).
func (s *Service) WithRooms(r roomControl) *Service {
	s.rooms = r
	return s
}

// requireAction confere se a pessoa tem a ação que o dono liberou para os
// cargos dela (o dono tem todas).
func (s *Service) requireAction(ctx context.Context, serverID, userID string, want Actions) error {
	actions, err := s.access.EventActions(ctx, serverID, userID)
	if err != nil {
		return fmt.Errorf("conferir permissões: %w", err)
	}
	if !actions.Has(want) {
		return ErrMissingPermission
	}
	return nil
}

// Create cria o evento (e os avisos da primeira ocorrência) de quem tem
// Gerenciar eventos.
func (s *Service) Create(ctx context.Context, serverID, actorID string, in Input) (*Event, error) {
	if err := s.requireAction(ctx, serverID, actorID, ActionCreate); err != nil {
		return nil, err
	}
	in, err := in.normalize(s.now())
	if err != nil {
		return nil, err
	}
	e := newEvent(serverID, actorID, in)
	if err := s.store.Create(ctx, e, reminderRows(e.NextStartAt, e.ReminderOffsets, s.now())); err != nil {
		return nil, fmt.Errorf("gravar evento: %w", err)
	}
	s.broadcast(serverID, "event:create", e)
	s.recordChange(ctx, audit.EventCreate, actorID, Event{}, e)
	return e, nil
}

func newEvent(serverID, actorID string, in Input) *Event {
	e := &Event{ID: uuid.NewString(), ServerID: serverID, Scope: "server", CreatedBy: &actorID}
	e.apply(in)
	return e
}

// apply passa o pedido já limpo para o evento e volta à primeira ocorrência.
func (e *Event) apply(in Input) {
	e.Title, e.Description, e.BannerID = in.Title, in.Description, in.BannerID
	e.StartsAt, e.NextStartAt, e.OccurrencesDone = in.StartsAt, in.StartsAt, 0
	e.DurationMinutes, e.GameName = in.DurationMinutes, gamePtr(in.GameName)
	e.Recurrence, e.RecurrenceUntil, e.RecurrenceCount = in.Recurrence, in.RecurrenceUntil, in.RecurrenceCount
	e.ReminderOffsets = in.ReminderOffsets
}

// Update troca os dados do evento vivo. Mudar o evento recomeça da primeira
// ocorrência e refaz os avisos.
func (s *Service) Update(ctx context.Context, serverID, eventID, actorID string, in Input) (*Event, error) {
	if err := s.requireAction(ctx, serverID, actorID, ActionEdit); err != nil {
		return nil, err
	}
	e, err := s.editable(ctx, serverID, eventID)
	if err != nil {
		return nil, err
	}
	before := *e
	if !s.now().Before(e.NextStartAt) {
		updated, err := s.updateBasics(ctx, e, in)
		s.recordChange(ctx, audit.EventUpdate, actorID, before, updated)
		return updated, err
	}
	in, err = in.normalize(s.now())
	if err != nil {
		return nil, err
	}
	oldBanner := e.BannerID
	e.apply(in)
	if err := s.store.Update(ctx, e, reminderRows(e.NextStartAt, e.ReminderOffsets, s.now())); err != nil {
		return nil, fmt.Errorf("atualizar evento: %w", err)
	}
	s.dropOldBanner(oldBanner, e.BannerID)
	s.broadcast(serverID, "event:update", e)
	s.recordChange(ctx, audit.EventUpdate, actorID, before, e)
	return e, nil
}

// editable: o evento, se ainda está vivo (nem cancelado nem encerrado).
func (s *Service) editable(ctx context.Context, serverID, eventID string) (*Event, error) {
	e, err := s.store.Find(ctx, serverID, eventID)
	if err != nil {
		return nil, err
	}
	if e.CanceledAt != nil || e.FinishedAt != nil {
		return nil, ErrEventNotFound
	}
	return e, nil
}

// Cancel cancela o evento e os avisos que ainda não saíram.
func (s *Service) Cancel(ctx context.Context, serverID, eventID, actorID string) error {
	if err := s.requireAction(ctx, serverID, actorID, ActionDelete); err != nil {
		return err
	}
	e, err := s.editable(ctx, serverID, eventID)
	if err != nil {
		return err
	}
	if err := s.store.Cancel(ctx, serverID, eventID); err != nil {
		return fmt.Errorf("cancelar evento: %w", err)
	}
	s.closeRoom(ctx, e)
	s.dropOldBanner(e.BannerID, nil)
	s.broadcast(serverID, "event:delete", map[string]string{"server_id": serverID, "event_id": eventID})
	s.record(ctx, eventEvent(audit.EventDelete, actorID, e, nil))
	return nil
}

// List devolve os eventos vivos do servidor para quem é membro.
func (s *Service) List(ctx context.Context, serverID, userID string) ([]Event, error) {
	if err := s.requireMember(ctx, serverID, userID); err != nil {
		return nil, err
	}
	return s.store.ListUpcoming(ctx, serverID, userID)
}

func (s *Service) requireMember(ctx context.Context, serverID, userID string) error {
	ok, err := s.members.IsMember(ctx, serverID, userID)
	if err != nil {
		return fmt.Errorf("conferir membro: %w", err)
	}
	if !ok {
		return ErrNotMember
	}
	return nil
}

func (s *Service) broadcast(serverID, typ string, payload any) {
	if s.pub != nil {
		s.pub.BroadcastToRoom("server:"+serverID, marshalEvent(typ, payload))
	}
}

// closeRoom fecha a sala do evento cancelado. Se falhar, o agendador tenta de
// novo (RoomsToClose também traz os eventos cancelados com sala aberta).
func (s *Service) closeRoom(ctx context.Context, e *Event) {
	if s.rooms == nil || (e.VoiceChannelID == nil && e.TextChannelID == nil) {
		return
	}
	ref := RoomRef{EventID: e.ID, ServerID: e.ServerID, VoiceID: e.VoiceChannelID, TextID: e.TextChannelID}
	if err := s.rooms.Close(ctx, ref); err != nil {
		log.Printf("[eventos] fechar a sala do evento %s: %v", e.ID, err)
	}
}

// updateBasics é a edição de um evento em andamento: só título, descrição e
// banner. Horário, duração, repetição e avisos têm que continuar como estão;
// a ocorrência, a sala e os avisos não são tocados.
func (s *Service) updateBasics(ctx context.Context, e *Event, in Input) (*Event, error) {
	in, err := in.cleanText()
	if err != nil {
		return nil, err
	}
	if err := sameSchedule(e, in); err != nil {
		return nil, err
	}
	oldBanner := e.BannerID
	e.Title, e.Description, e.BannerID = in.Title, in.Description, in.BannerID
	if err := s.store.UpdateBasics(ctx, e); err != nil {
		return nil, fmt.Errorf("atualizar evento: %w", err)
	}
	s.dropOldBanner(oldBanner, e.BannerID)
	s.broadcast(e.ServerID, "event:update", e)
	return e, nil
}

// sameSchedule diz se o pedido mantém o horário, a duração, a repetição e os
// avisos do evento (ErrEventRunning se mudar algum; erro de campo inválido sobe como é).
func sameSchedule(e *Event, in Input) error {
	duration, err := cleanDuration(in.DurationMinutes)
	if err != nil {
		return err
	}
	offsets, err := cleanOffsets(in.ReminderOffsets)
	if err != nil {
		return err
	}
	if !in.StartsAt.Equal(e.StartsAt) || duration != e.DurationMinutes || in.Recurrence != e.Recurrence ||
		!sameValue(gamePtr(in.GameName), e.GameName, func(a, b string) bool { return a == b }) ||
		!sameValue(in.RecurrenceUntil, e.RecurrenceUntil, time.Time.Equal) ||
		!sameValue(in.RecurrenceCount, e.RecurrenceCount, func(a, b int) bool { return a == b }) ||
		!slices.Equal(offsets, e.ReminderOffsets) {
		return ErrEventRunning
	}
	return nil
}

// gamePtr: o nome do jogo como o evento o guarda (vazio = nil, sem jogo).
func gamePtr(name string) *string {
	if name == "" {
		return nil
	}
	return &name
}

// sameValue compara dois opcionais: os dois vazios ou os dois com valor igual.
func sameValue[T any](a, b *T, equal func(T, T) bool) bool {
	if a == nil || b == nil {
		return a == b
	}
	return equal(*a, *b)
}

// dropOldBanner apaga o arquivo do banner que saiu do evento (trocado, tirado
// ou do evento cancelado). Banner igual ao novo fica.
func (s *Service) dropOldBanner(old, current *string) {
	if s.banners == nil || old == nil || (current != nil && *current == *old) {
		return
	}
	if err := s.banners.Remove(*old); err != nil {
		log.Printf("[eventos] apagar o banner %s: %v", *old, err)
	}
}
