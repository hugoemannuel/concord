package proposal

import (
	"context"
	"os"
	"strings"
	"testing"

	"gin-quickstart/backend/internal/badge"
	"gin-quickstart/backend/internal/platform/database"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// archiveEnv abre o Postgres descartável e devolve repositório e atalhos.
func archiveEnv(t *testing.T) (*Repository, *pgxpool.Pool, func() string, func(author, title, status string) string) {
	t.Helper()
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL não definido")
	}
	ctx := context.Background()
	db, err := database.Connect(url)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(db.Close)
	if err := database.Migrate(db, "../../migrations"); err != nil {
		t.Fatal(err)
	}
	newUser := func() string {
		t.Helper()
		id := uuid.NewString()
		name := "a" + strings.ReplaceAll(id, "-", "")[:12]
		if _, err := db.Exec(ctx, `INSERT INTO users (id, username, display_name, email, password_hash) VALUES ($1, $2::text, $2::text, $2::text || '@ex.com', 'x')`, id, name); err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { db.Exec(ctx, `DELETE FROM users WHERE id = $1`, id) })
		return id
	}
	card := func(author, title, status string) string {
		t.Helper()
		var id string
		err := db.QueryRow(ctx, `
			INSERT INTO proposals (author_id, title, description, status, voting_ends_at, moved_at)
			VALUES ($1, $2, 'descrição', $3, NOW(), NOW()) RETURNING id`, author, title, status).Scan(&id)
		if err != nil {
			t.Fatal(err)
		}
		return id
	}
	return ProposalRepository(db), db, newUser, card
}

func ids(list []Proposal) []string {
	out := make([]string, 0, len(list))
	for _, p := range list {
		out = append(out, p.ID)
	}
	return out
}

func contains(list []string, id string) bool {
	for _, x := range list {
		if x == id {
			return true
		}
	}
	return false
}

func TestArchiveSomeDoQuadroMasNaoDoBanco(t *testing.T) {
	repo, _, newUser, card := archiveEnv(t)
	ctx := context.Background()
	u := newUser()
	done, open := card(u, "Concluída antiga", StatusDone), card(u, "Em andamento", StatusInProgress)

	archived, err := repo.Archive(ctx, []string{done, open})
	if err != nil {
		t.Fatal(err)
	}
	if len(archived) != 1 || archived[0] != done {
		t.Fatalf("arquivadas = %v, só a concluída podia (%s)", archived, done)
	}
	board, _ := repo.List(ctx, u)
	if contains(ids(board), done) || !contains(ids(board), open) {
		t.Fatalf("quadro = %v: a arquivada devia sumir e a aberta ficar", ids(board))
	}
	p, err := repo.Get(ctx, done, nil)
	if err != nil || p.ArchivedAt == nil {
		t.Fatalf("Get da arquivada: %v %+v (nada pode ser apagado)", err, p)
	}
}

func TestArchiveAllPorStatusEUnarchive(t *testing.T) {
	repo, _, newUser, card := archiveEnv(t)
	ctx := context.Background()
	u := newUser()
	d1, d2, rej := card(u, "Done um", StatusDone), card(u, "Done dois", StatusDone), card(u, "Recusada", StatusRejected)

	got, err := repo.ArchiveByStatus(ctx, StatusDone)
	if err != nil {
		t.Fatal(err)
	}
	if !contains(got, d1) || !contains(got, d2) || contains(got, rej) {
		t.Fatalf("em lote = %v, queria só as concluídas", got)
	}
	again, _ := repo.ArchiveByStatus(ctx, StatusDone)
	if len(again) != 0 {
		t.Fatalf("segunda rodada arquivou %v de novo", again)
	}
	if ok, err := repo.Unarchive(ctx, d1); err != nil || !ok {
		t.Fatalf("Unarchive = %v %v", ok, err)
	}
	if ok, _ := repo.Unarchive(ctx, d1); ok {
		t.Fatal("desarquivar duas vezes devia dizer que nada mudou")
	}
	board, _ := repo.List(ctx, u)
	if !contains(ids(board), d1) || contains(ids(board), d2) {
		t.Fatalf("quadro = %v: d1 volta, d2 segue arquivada", ids(board))
	}
}

func TestListArchivedPaginaBuscaEOrdem(t *testing.T) {
	repo, db, newUser, card := archiveEnv(t)
	ctx := context.Background()
	u := newUser()
	tag := uuid.NewString()[:8]
	var order []string
	for i, title := range []string{"Alfa " + tag, "Beta " + tag, "Gama_100% " + tag} {
		id := card(u, title, StatusDone)
		if _, err := repo.Archive(ctx, []string{id}); err != nil {
			t.Fatal(err)
		}
		db.Exec(ctx, `UPDATE proposals SET archived_at = NOW() - make_interval(mins => $2) WHERE id = $1`, id, 10-i)
		order = append(order, id)
	}
	list, more, err := repo.ListArchived(ctx, u, tag, 2, 0)
	if err != nil || len(list) != 2 || !more {
		t.Fatalf("página 1: %v more=%v err=%v", ids(list), more, err)
	}
	if list[0].ID != order[2] || list[1].ID != order[1] {
		t.Fatalf("ordem = %v, queria a mais recente primeiro", ids(list))
	}
	list, more, _ = repo.ListArchived(ctx, u, tag, 2, 2)
	if len(list) != 1 || more || list[0].ID != order[0] {
		t.Fatalf("página 2: %v more=%v", ids(list), more)
	}
	// Busca simples; % e _ valem como texto, não como curinga.
	list, _, _ = repo.ListArchived(ctx, u, "gama_100% "+tag, 10, 0)
	if len(list) != 1 || list[0].ID != order[2] {
		t.Fatalf("busca = %v", ids(list))
	}
	if list, _, _ = repo.ListArchived(ctx, u, "%", 10, 0); len(list) != 0 && contains(ids(list), order[0]) {
		t.Fatalf("'%%' virou curinga: %v", ids(list))
	}
}

// Badge Contribuinte/Votante e as contagens do card não mudam ao arquivar.
func TestArchiveNaoMexeEmBadgesVotosNemComentarios(t *testing.T) {
	repo, db, newUser, card := archiveEnv(t)
	ctx := context.Background()
	author, voter := newUser(), newUser()
	id := card(author, "Concluída com votos", StatusDone)
	db.Exec(ctx, `INSERT INTO proposal_votes (proposal_id, user_id, approve) VALUES ($1, $2, true)`, id, voter)
	if _, err := repo.CreateComment(ctx, id, voter, "um comentário", nil, nil, nil); err != nil {
		t.Fatal(err)
	}
	bad := badge.BadgeRepository(db)
	before, err := bad.Stats(ctx, author)
	if err != nil {
		t.Fatal(err)
	}
	votesBefore, _ := bad.Stats(ctx, voter)
	cardBefore, _ := repo.Get(ctx, id, &voter)

	if _, err := repo.Archive(ctx, []string{id}); err != nil {
		t.Fatal(err)
	}
	after, _ := bad.Stats(ctx, author)
	votesAfter, _ := bad.Stats(ctx, voter)
	cardAfter, _ := repo.Get(ctx, id, &voter)
	if after.Proposals != before.Proposals || votesAfter.Votes != votesBefore.Votes {
		t.Fatalf("badges mudaram: propostas %d→%d, votos %d→%d", before.Proposals, after.Proposals, votesBefore.Votes, votesAfter.Votes)
	}
	if cardAfter.YesVotes != cardBefore.YesVotes || cardAfter.CommentCount != cardBefore.CommentCount ||
		cardAfter.MyVote == nil || before.Proposals != 1 {
		t.Fatalf("contagens do card mudaram: %+v → %+v", cardBefore, cardAfter)
	}
}
