package server

import (
	"context"
	"errors"
	"testing"
)

type fakeOwnershipStore struct {
	server      *Server
	transferred bool
	gotTo       string
}

func (f *fakeOwnershipStore) FindByID(context.Context, string) (*Server, error) {
	if f.server == nil {
		return nil, errors.New("not found")
	}
	copy := *f.server
	return &copy, nil
}

func (f *fakeOwnershipStore) TransferOwner(_ context.Context, _, _, to string) (bool, error) {
	f.gotTo = to
	if f.transferred {
		f.server.OwnerID = to
	}
	return f.transferred, nil
}

type fakeServerUpdates struct{ events []UpdateEvent }

func (f *fakeServerUpdates) PublishServerUpdate(e UpdateEvent) { f.events = append(f.events, e) }

func TestTransferOwnership(t *testing.T) {
	for _, tc := range []struct {
		name        string
		server      *Server
		actor, to   string
		transferred bool
		want        error
	}{
		{"servidor não existe", nil, "dono", "ana", false, ErrServerNotFound},
		{"só o dono transfere", &Server{ID: "s", OwnerID: "dono"}, "ana", "bia", false, ErrNotServerOwner},
		{"para si mesmo não", &Server{ID: "s", OwnerID: "dono"}, "dono", "dono", false, ErrInvalidNewOwner},
		{"novo dono precisa ser membro (e não bot)", &Server{ID: "s", OwnerID: "dono"}, "dono", "fora", false, ErrInvalidNewOwner},
		{"transfere", &Server{ID: "s", OwnerID: "dono"}, "dono", "ana", true, nil},
	} {
		t.Run(tc.name, func(t *testing.T) {
			store := &fakeOwnershipStore{server: tc.server, transferred: tc.transferred}
			updates := &fakeServerUpdates{}
			got, err := NewOwnershipService(store, updates).Transfer(context.Background(), "s", tc.actor, tc.to)

			if !errors.Is(err, tc.want) {
				t.Fatalf("Transfer = %v, quer %v", err, tc.want)
			}
			if tc.want != nil {
				if len(updates.events) != 0 {
					t.Errorf("publicou %d eventos numa transferência recusada", len(updates.events))
				}
				return
			}
			if got.OwnerID != "ana" || len(updates.events) != 1 || updates.events[0].Server.OwnerID != "ana" {
				t.Errorf("servidor = %+v, eventos = %+v; quer dono ana publicado", got, updates.events)
			}
		})
	}
}
