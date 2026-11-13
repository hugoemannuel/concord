package channel

import (
	"testing"

	"github.com/google/uuid"
)

// Prazo e visualização única num Postgres de verdade: nasce desligado e
// permitido, a edição grava, 0 vira NULL, o campo ausente não mexe.
func TestRepositoryDisappearing(t *testing.T) {
	db, ctx := channelDB(t)
	repo := ChannelRepository(db)
	owner, serverID := seedServer(t, db, ctx)
	ch := &Channel{ID: uuid.NewString(), ServerID: serverID, Name: "geral", Type: TypeText, CreatedBy: owner}
	if err := repo.Create(ctx, ch, nil); err != nil {
		t.Fatal(err)
	}
	got, err := repo.FindByID(ctx, ch.ID)
	if err != nil || got.DisappearingSeconds != nil || !got.AllowViewOnce {
		t.Fatalf("nasce com %+v (%v)", got, err)
	}

	week, no := 604800, false
	if err := repo.Update(ctx, ch.ID, UpdateInput{Name: "geral", DisappearingSeconds: &week, AllowViewOnce: &no}); err != nil {
		t.Fatal(err)
	}
	if err := repo.Update(ctx, ch.ID, UpdateInput{Name: "papo"}); err != nil {
		t.Fatal(err)
	}
	got, _ = repo.FindByID(ctx, ch.ID)
	if got.DisappearingSeconds == nil || *got.DisappearingSeconds != week || got.AllowViewOnce {
		t.Fatalf("campo ausente mexeu: %+v", got)
	}
	list, err := repo.ListByServerID(ctx, serverID)
	if err != nil || len(list) != 1 || list[0].DisappearingSeconds == nil || *list[0].DisappearingSeconds != week || list[0].AllowViewOnce {
		t.Fatalf("ListByServerID: %+v %v", list, err)
	}

	zero, yes := 0, true
	if err := repo.Update(ctx, ch.ID, UpdateInput{Name: "papo", DisappearingSeconds: &zero, AllowViewOnce: &yes}); err != nil {
		t.Fatal(err)
	}
	got, _ = repo.FindByID(ctx, ch.ID)
	if got.DisappearingSeconds != nil || !got.AllowViewOnce {
		t.Fatalf("0 deveria virar NULL: %+v", got)
	}
	bad := 3600
	if err := repo.Update(ctx, ch.ID, UpdateInput{Name: "papo", DisappearingSeconds: &bad}); err == nil {
		t.Fatal("o banco aceitou 3600")
	}
}
