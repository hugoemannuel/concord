package channel

import (
	"testing"

	"github.com/google/uuid"
)

// O modo lento num Postgres de verdade: nasce desligado, a edição grava, a
// edição sem o campo mantém e o banco recusa valor fora da faixa.
func TestRepositorySlowmode(t *testing.T) {
	db, ctx := channelDB(t)
	repo := ChannelRepository(db)
	owner, serverID := seedServer(t, db, ctx)
	ch := &Channel{ID: uuid.NewString(), ServerID: serverID, Name: "geral", Type: TypeText, CreatedBy: owner}
	if err := repo.Create(ctx, ch, nil); err != nil {
		t.Fatal(err)
	}
	if got, err := repo.SlowmodeSeconds(ctx, ch.ID); err != nil || got != 0 {
		t.Fatalf("nasce com %d (%v), quero 0", got, err)
	}

	thirty := 30
	if err := repo.Update(ctx, ch.ID, UpdateInput{Name: "geral", SlowmodeSeconds: &thirty}); err != nil {
		t.Fatal(err)
	}
	if err := repo.Update(ctx, ch.ID, UpdateInput{Name: "papo"}); err != nil {
		t.Fatal(err)
	}
	got, err := repo.FindByID(ctx, ch.ID)
	if err != nil || got.SlowmodeSeconds != 30 || got.Name != "papo" {
		t.Fatalf("FindByID: %+v %v", got, err)
	}
	list, err := repo.ListByServerID(ctx, serverID)
	if err != nil || len(list) != 1 || list[0].SlowmodeSeconds != 30 {
		t.Fatalf("ListByServerID: %+v %v", list, err)
	}

	tooLong := 21601
	if err := repo.Update(ctx, ch.ID, UpdateInput{Name: "papo", SlowmodeSeconds: &tooLong}); err == nil {
		t.Fatal("o banco aceitou mais de 6 h")
	}
	if err := repo.Update(ctx, uuid.NewString(), UpdateInput{Name: "x"}); err != ErrChannelNotFound {
		t.Fatalf("canal que não existe: %v", err)
	}
	if _, err := repo.SlowmodeSeconds(ctx, uuid.NewString()); err == nil {
		t.Fatal("canal que não existe deveria dar erro")
	}
}
