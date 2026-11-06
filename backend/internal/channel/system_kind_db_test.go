package channel

import (
	"testing"

	"github.com/google/uuid"
)

// O tipo do canal de sistema (system_kind, migration 000197) num Postgres de
// verdade (TEST_DATABASE_URL, banco descartável já migrado): o backfill segue a
// regra antiga do nome e as consultas passam a usar só o tipo.

func TestSystemKindBackfillFollowsTheOldNameRule(t *testing.T) {
	db, ctx := channelDB(t)
	owner, serverID := seedServer(t, db, ctx)
	_, other := seedServer(t, db, ctx)
	add := func(server, name, typ string, system bool) string {
		id := uuid.NewString()
		if _, err := db.Exec(ctx, `INSERT INTO channels (id, server_id, name, type, created_by, position, is_system) VALUES ($1, $2, $3, $4, $5, 0, $6)`,
			id, server, name, typ, owner, system); err != nil {
			t.Fatal(err)
		}
		return id
	}
	musica := add(serverID, "musica", TypeText, true)
	avisos := add(serverID, "avisos", TypeText, true)
	comum := add(serverID, "geral", TypeText, false)
	maestroAlt := add(other, "musica-maestro", TypeText, true)
	avisosAlt := add(other, "avisos-sistema", TypeText, true)
	musicaComum := add(other, "musica", TypeText, false)

	if _, err := db.Exec(ctx, readFile(t, "../../migrations/000197_canal_de_sistema_tipo.up.sql")); err != nil {
		t.Fatal(err)
	}
	for id, want := range map[string]string{
		musica: SystemKindMaestro, maestroAlt: SystemKindMaestro,
		avisos: SystemKindNotices, avisosAlt: SystemKindNotices,
		comum: "", musicaComum: "",
	} {
		var got *string
		if err := db.QueryRow(ctx, `SELECT system_kind FROM channels WHERE id = $1`, id).Scan(&got); err != nil {
			t.Fatal(err)
		}
		if (got == nil && want != "") || (got != nil && *got != want) {
			t.Errorf("canal %s: system_kind = %v, want %q", id, got, want)
		}
	}

	repo := ChannelRepository(db)
	if ch, err := repo.FindSystemByServerID(ctx, other); err != nil || ch.ID != maestroAlt || kindOf(ch) != SystemKindMaestro {
		t.Errorf("FindSystemByServerID = %+v, %v; want %s", ch, err, maestroAlt)
	}
	if ch, err := repo.FindNoticesByServerID(ctx, other); err != nil || ch.ID != avisosAlt {
		t.Errorf("FindNoticesByServerID = %+v, %v; want %s", ch, err, avisosAlt)
	}
}

func TestSystemChannelsAreFoundByKindNotName(t *testing.T) {
	db, ctx := channelDB(t)
	repo := ChannelRepository(db)
	owner, serverID := seedServer(t, db, ctx)
	create := func(name string, system bool, kind *string) *Channel {
		ch := &Channel{ID: uuid.NewString(), ServerID: serverID, Name: name, Type: TypeText, CreatedBy: owner, IsSystem: system, SystemKind: kind}
		if err := repo.Create(ctx, ch, nil); err != nil {
			t.Fatal(err)
		}
		return ch
	}
	maestro, notices := SystemKindMaestro, SystemKindNotices
	// Nome que a regra antiga não reconheceria: só o tipo decide.
	som := create("som", true, &maestro)
	quadro := create("quadro", true, &notices)
	// Canal de sistema com o nome antigo, mas sem tipo, não é o do Maestro.
	create("musica", true, nil)
	plain := create("geral", false, nil)

	if kindOf(som) != SystemKindMaestro || plain.SystemKind != nil {
		t.Fatalf("Create devolve o tipo: som=%v geral=%v", som.SystemKind, plain.SystemKind)
	}
	if ch, err := repo.FindSystemByServerID(ctx, serverID); err != nil || ch.ID != som.ID {
		t.Errorf("FindSystemByServerID = %+v, %v; want %s", ch, err, som.ID)
	}
	if ch, err := repo.FindNoticesByServerID(ctx, serverID); err != nil || ch.ID != quadro.ID || kindOf(ch) != SystemKindNotices {
		t.Errorf("FindNoticesByServerID = %+v, %v; want %s", ch, err, quadro.ID)
	}
	list, err := repo.ListByServerID(ctx, serverID)
	if err != nil {
		t.Fatal(err)
	}
	kinds := map[string]string{}
	for i := range list {
		kinds[list[i].ID] = kindOf(&list[i])
	}
	if kinds[som.ID] != SystemKindMaestro || kinds[quadro.ID] != SystemKindNotices || kinds[plain.ID] != "" {
		t.Errorf("ListByServerID kinds = %v", kinds)
	}

	all, err := repo.MaestroChannels(ctx)
	if err != nil {
		t.Fatal(err)
	}
	found := 0
	for _, ch := range all {
		if ch.ServerID == serverID {
			found++
			if ch.ID != som.ID {
				t.Errorf("MaestroChannels inclui %s (%s)", ch.ID, ch.Name)
			}
		}
	}
	if found != 1 {
		t.Errorf("MaestroChannels achou %d canais do servidor, want 1", found)
	}
}
