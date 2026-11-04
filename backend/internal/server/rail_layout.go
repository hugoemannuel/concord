package server

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"strings"
	"unicode/utf8"
)

const (
	RailItemServer = "server"
	RailItemFolder = "folder"

	DefaultRailFolderName  = "Pasta de servidores"
	MaxRailFolderNameRunes = 40
	MaxRailLayoutItems     = 200
)

var ErrInvalidRailLayout = errors.New("invalid server rail layout")

// RailLayoutItem é uma entrada no topo da barra lateral: servidor avulso ou pasta.
type RailLayoutItem struct {
	Kind      string   `json:"kind"`
	ServerID  string   `json:"server_id,omitempty"`
	ID        string   `json:"id,omitempty"`
	Name      string   `json:"name,omitempty"`
	ServerIDs []string `json:"server_ids,omitempty"`
}

type RailLayoutState struct {
	Items []RailLayoutItem `json:"items"`
}

type RailLayoutStore interface {
	GetRailLayout(ctx context.Context, userID string) ([]RailLayoutItem, error)
	SetRailLayout(ctx context.Context, userID string, items []RailLayoutItem) error
	ListByUserID(ctx context.Context, userID string) ([]Server, error)
}

// UserEventPublisher envia eventos em tempo real para as janelas da própria pessoa.
type UserEventPublisher interface {
	SendToUser(userID string, event []byte)
}

type RailLayoutService struct {
	store     RailLayoutStore
	publisher UserEventPublisher
}

func NewRailLayoutService(store RailLayoutStore, publisher UserEventPublisher) *RailLayoutService {
	return &RailLayoutService{store: store, publisher: publisher}
}

func validateFolderItem(item RailLayoutItem, seenFolders map[string]bool) error {
	id := strings.TrimSpace(item.ID)
	if id == "" || len(id) > 64 || seenFolders[id] {
		return ErrInvalidRailLayout
	}
	if utf8.RuneCountInString(strings.TrimSpace(item.Name)) > MaxRailFolderNameRunes {
		return ErrInvalidRailLayout
	}
	seenFolders[id] = true
	return nil
}

func validateSingleItem(item RailLayoutItem, seenFolders map[string]bool) error {
	switch item.Kind {
	case RailItemServer:
		if strings.TrimSpace(item.ServerID) == "" {
			return ErrInvalidRailLayout
		}
		return nil
	case RailItemFolder:
		return validateFolderItem(item, seenFolders)
	default:
		return ErrInvalidRailLayout
	}
}

// ValidateRailLayout confere o formato enviado pelo cliente antes de reconciliar.
func ValidateRailLayout(items []RailLayoutItem) error {
	if len(items) > MaxRailLayoutItems {
		return ErrInvalidRailLayout
	}
	seenFolders := make(map[string]bool, len(items))
	for _, item := range items {
		if err := validateSingleItem(item, seenFolders); err != nil {
			return err
		}
	}
	return nil
}

func normalizeFolderName(raw string) string {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return DefaultRailFolderName
	}
	return trimmed
}

func takeAllowedIDs(ids []string, allowed map[string]bool, placed map[string]bool) []string {
	out := make([]string, 0, len(ids))
	for _, id := range ids {
		if allowed[id] && !placed[id] {
			placed[id] = true
			out = append(out, id)
		}
	}
	return out
}

func reconcileItem(item RailLayoutItem, allowed, placed map[string]bool) (RailLayoutItem, bool) {
	if item.Kind == RailItemServer {
		if !allowed[item.ServerID] || placed[item.ServerID] {
			return RailLayoutItem{}, false
		}
		placed[item.ServerID] = true
		return RailLayoutItem{Kind: RailItemServer, ServerID: item.ServerID}, true
	}
	if item.Kind == RailItemFolder {
		members := takeAllowedIDs(item.ServerIDs, allowed, placed)
		if len(members) == 0 {
			return RailLayoutItem{}, false
		}
		return RailLayoutItem{
			Kind:      RailItemFolder,
			ID:        strings.TrimSpace(item.ID),
			Name:      normalizeFolderName(item.Name),
			ServerIDs: members,
		}, true
	}
	return RailLayoutItem{}, false
}

// ReconcileRailLayout filtra servidores de que a pessoa não faz parte, tira
// duplicatas, desfaz pastas vazias e acrescenta no fim os servidores novos.
func ReconcileRailLayout(items []RailLayoutItem, currentServerIDs []string) []RailLayoutItem {
	allowed := make(map[string]bool, len(currentServerIDs))
	for _, id := range currentServerIDs {
		allowed[id] = true
	}
	placed := make(map[string]bool, len(currentServerIDs))
	out := make([]RailLayoutItem, 0, len(currentServerIDs))
	for _, item := range items {
		if clean, ok := reconcileItem(item, allowed, placed); ok {
			out = append(out, clean)
		}
	}
	for _, id := range currentServerIDs {
		if !placed[id] {
			out = append(out, RailLayoutItem{Kind: RailItemServer, ServerID: id})
		}
	}
	return out
}

func extractServerIDs(servers []Server) []string {
	ids := make([]string, len(servers))
	for i, s := range servers {
		ids[i] = s.ID
	}
	return ids
}

func (s *RailLayoutService) Get(ctx context.Context, userID string) ([]RailLayoutItem, error) {
	saved, err := s.store.GetRailLayout(ctx, userID)
	if err != nil {
		return nil, err
	}
	servers, err := s.store.ListByUserID(ctx, userID)
	if err != nil {
		return nil, err
	}
	return ReconcileRailLayout(saved, extractServerIDs(servers)), nil
}

func (s *RailLayoutService) Save(ctx context.Context, userID string, items []RailLayoutItem) ([]RailLayoutItem, error) {
	if err := ValidateRailLayout(items); err != nil {
		return nil, err
	}
	servers, err := s.store.ListByUserID(ctx, userID)
	if err != nil {
		return nil, err
	}
	reconciled := ReconcileRailLayout(items, extractServerIDs(servers))
	if err := s.store.SetRailLayout(ctx, userID, reconciled); err != nil {
		return nil, err
	}
	s.publish(userID, reconciled)
	return reconciled, nil
}

func (s *RailLayoutService) publish(userID string, items []RailLayoutItem) {
	if s.publisher == nil {
		return
	}
	data, err := json.Marshal(map[string]any{
		"type":    "server:layout",
		"payload": RailLayoutState{Items: items},
	})
	if err != nil {
		log.Printf("[server] publish rail layout: %v", err)
		return
	}
	s.publisher.SendToUser(userID, data)
}
