package channelcategory

import (
	"context"
	"os"
	"testing"

	"gin-quickstart/backend/internal/channel"
	"gin-quickstart/backend/internal/platform/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

func categoryTestDB(t *testing.T) (*pgxpool.Pool, context.Context) {
	t.Helper()
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL não definido")
	}
	db, err := database.Connect(url)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(db.Close)
	if err := database.Migrate(db, "../../migrations"); err != nil {
		t.Fatal(err)
	}
	return db, context.Background()
}

func TestRepositoryLayout(t *testing.T) {
	db, ctx := categoryTestDB(t)
	owner, server, other := uuid.NewString(), uuid.NewString(), uuid.NewString()
	_, err := db.Exec(ctx, `INSERT INTO users(id,username,display_name,email,password_hash) VALUES($1,$2,$2,$3,'x')`, owner, "c"+owner[:8], owner[:8]+"@teste.dev")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _, _ = db.Exec(ctx, `DELETE FROM users WHERE id=$1`, owner) })
	_, err = db.Exec(ctx, `INSERT INTO servers(id,name,owner_id) VALUES($1,'um',$3),($2,'dois',$3)`, server, other, owner)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _, _ = db.Exec(ctx, `DELETE FROM servers WHERE id IN ($1,$2)`, server, other) })
	ids := []string{uuid.NewString(), uuid.NewString(), uuid.NewString()}
	for i, id := range ids {
		_, err = db.Exec(ctx, `INSERT INTO channels(id,server_id,name,type,position,created_by) VALUES($1,$2,$3,'text',$4,$5)`, id, server, id, i, owner)
		if err != nil {
			t.Fatal(err)
		}
	}
	repo := NewRepository(db)
	if err = repo.Create(ctx, server, "Jogos"); err != nil {
		t.Fatal(err)
	}
	if err = repo.Create(ctx, other, "Outro"); err != nil {
		t.Fatal(err)
	}
	layout, err := repo.List(ctx, server)
	if err != nil {
		t.Fatal(err)
	}
	if len(layout.Categories) != 1 || len(layout.Channels) != 3 {
		t.Fatalf("layout: %+v", layout)
	}
	cat := layout.Categories[0].ID
	t.Run("cria canal já na categoria", func(t *testing.T) {
		channels := channel.ChannelRepository(db)
		for _, kind := range []string{channel.TypeText, channel.TypeVoice} {
			ch := &channel.Channel{ID: uuid.NewString(), ServerID: server, Name: "novo-" + kind, Type: kind, CreatedBy: owner, CategoryID: &cat}
			if err := channels.Create(ctx, ch, nil); err != nil {
				t.Fatal(err)
			}
			var got string
			if err := db.QueryRow(ctx, `SELECT category_id::text FROM channel_category_layout WHERE channel_id=$1`, ch.ID).Scan(&got); err != nil || got != cat {
				t.Fatalf("categoria=%s erro=%v", got, err)
			}
			if err := channels.Delete(ctx, ch.ID); err != nil {
				t.Fatal(err)
			}
		}
	})
	foreign, err := repo.List(ctx, other)
	if err != nil {
		t.Fatal(err)
	}
	t.Run("categoria inválida reverte a criação do canal", func(t *testing.T) {
		invalid := foreign.Categories[0].ID
		ch := &channel.Channel{ID: uuid.NewString(), ServerID: server, Name: "não-criar", Type: channel.TypeText, CreatedBy: owner, CategoryID: &invalid}
		if err := channel.ChannelRepository(db).Create(ctx, ch, nil); err == nil {
			t.Fatal("aceitou categoria de outro servidor")
		}
		var count int
		if err := db.QueryRow(ctx, `SELECT COUNT(*) FROM channels WHERE id=$1`, ch.ID).Scan(&count); err != nil || count != 0 {
			t.Fatalf("canal persistido=%d erro=%v", count, err)
		}
	})
	if err := repo.MoveChannel(ctx, server, ids[0], &foreign.Categories[0].ID, nil); err == nil {
		t.Fatal("aceitou categoria de outro servidor")
	}
	if err := repo.MoveChannel(ctx, server, ids[0], &cat, nil); err != nil {
		t.Fatal(err)
	}
	if err := repo.MoveChannel(ctx, server, ids[1], &cat, &ids[0]); err != nil {
		t.Fatal(err)
	}
	layout, err = repo.List(ctx, server)
	if err != nil {
		t.Fatal(err)
	}
	var grouped []string
	for _, ch := range layout.Channels {
		if ch.CategoryID != nil && *ch.CategoryID == cat {
			grouped = append(grouped, ch.ChannelID)
		}
	}
	if len(grouped) != 2 || grouped[0] != ids[1] || grouped[1] != ids[0] {
		t.Fatalf("ordem: %v", grouped)
	}
	if err := repo.Delete(ctx, server, cat); err != nil {
		t.Fatal(err)
	}
	layout, err = repo.List(ctx, server)
	if err != nil {
		t.Fatal(err)
	}
	if len(layout.Channels) != 3 {
		t.Fatalf("canais perdidos: %+v", layout)
	}
	for _, ch := range layout.Channels {
		if ch.CategoryID != nil {
			t.Fatalf("categoria não removida: %+v", ch)
		}
	}
}
