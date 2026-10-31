package auth

import (
	"context"
	"errors"
	"math"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"gin-quickstart/backend/internal/platform/database"
	"gin-quickstart/backend/internal/user"
)

// Num Postgres de verdade (TEST_DATABASE_URL, banco descartável): quanto o link
// vale, o reenvio que mantém os links anteriores e a troca que os invalida.

func emailTokensDB(t *testing.T) (*pgxpool.Pool, *Repository) {
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
	return db, AuthRepository(db)
}

func insertTokenOwner(t *testing.T, db *pgxpool.Pool) string {
	t.Helper()
	id := uuid.NewString()
	name := "t" + id[:8]
	if _, err := db.Exec(context.Background(), `INSERT INTO users (id, username, display_name, email, password_hash) VALUES ($1, $2::text, $2::text, $2::text || '@ex.com', 'x')`, id, name); err != nil {
		t.Fatal(err)
	}
	return id
}

func newTokenHash() string { return hashEmailToken(uuid.NewString()) }

func TestDBLinksLastWhatTheMailSays(t *testing.T) {
	db, repo := emailTokensDB(t)
	id := insertTokenOwner(t, db)
	mail := &captureMailer{}
	svc := &EmailService{tokens: repo, mailer: mail, appURL: "https://app.test", async: func(f func()) { f() }}
	u := &user.User{ID: id, Email: "x@ex.com", DisplayName: "X"}
	svc.SendVerification(u)
	svc.SendPasswordReset(u)

	for i, tc := range []struct {
		purpose string
		want    time.Duration
		text    string
	}{
		{purposeVerifyEmail, 24 * time.Hour, "expira em 24 horas"},
		{purposeResetPassword, time.Hour, "expira em 1 hora"},
	} {
		var seconds float64
		err := db.QueryRow(context.Background(),
			`SELECT EXTRACT(EPOCH FROM expires_at - created_at)::float8 FROM email_tokens WHERE user_id = $1 AND purpose = $2`,
			id, tc.purpose).Scan(&seconds)
		if err != nil {
			t.Fatal(err)
		}
		if math.Abs(seconds-tc.want.Seconds()) > 60 {
			t.Errorf("%s: o link vale %.0f s, quer %.0f s", tc.purpose, seconds, tc.want.Seconds())
		}
		if !strings.Contains(mail.sent[i].Text, tc.text) {
			t.Errorf("%s: o e-mail não diz %q:\n%s", tc.purpose, tc.text, mail.sent[i].Text)
		}
	}
}

func TestDBAddKeepsEarlierLinksAndCreateInvalidatesThem(t *testing.T) {
	db, repo := emailTokensDB(t)
	ctx := context.Background()
	id := insertTokenOwner(t, db)
	exp := time.Now().Add(time.Hour)

	first, second := newTokenHash(), newTokenHash()
	for _, h := range []string{first, second} {
		if err := repo.AddEmailToken(ctx, id, purposeVerifyEmail, h, exp); err != nil {
			t.Fatal(err)
		}
	}
	for _, h := range []string{first, second} {
		if owner, err := repo.ConsumeEmailToken(ctx, purposeVerifyEmail, h); err != nil || owner != id {
			t.Fatalf("link mantido pelo Add: dono %q, erro %v", owner, err)
		}
	}

	old, replacement := newTokenHash(), newTokenHash()
	if err := repo.AddEmailToken(ctx, id, purposeVerifyEmail, old, exp); err != nil {
		t.Fatal(err)
	}
	if err := repo.CreateEmailToken(ctx, id, purposeVerifyEmail, replacement, exp); err != nil {
		t.Fatal(err)
	}
	if _, err := repo.ConsumeEmailToken(ctx, purposeVerifyEmail, old); !errors.Is(err, ErrInvalidEmailToken) {
		t.Fatalf("link anterior ao Create: erro %v, quer ErrInvalidEmailToken", err)
	}
	if _, err := repo.ConsumeEmailToken(ctx, purposeVerifyEmail, replacement); err != nil {
		t.Fatalf("link do Create: %v", err)
	}
	if owner, err := repo.EmailTokenOwner(ctx, purposeVerifyEmail, replacement); err != nil || owner != id {
		t.Fatalf("dono do link usado: %q, %v", owner, err)
	}
}

func TestDBInvalidateEmailTokensCoversEveryPurpose(t *testing.T) {
	db, repo := emailTokensDB(t)
	ctx := context.Background()
	id, other := insertTokenOwner(t, db), insertTokenOwner(t, db)
	exp := time.Now().Add(time.Hour)
	verify, reset, others := newTokenHash(), newTokenHash(), newTokenHash()
	for _, tok := range []struct{ user, purpose, hash string }{
		{id, purposeVerifyEmail, verify}, {id, purposeResetPassword, reset}, {other, purposeVerifyEmail, others},
	} {
		if err := repo.AddEmailToken(ctx, tok.user, tok.purpose, tok.hash, exp); err != nil {
			t.Fatal(err)
		}
	}

	if err := repo.InvalidateEmailTokens(ctx, id); err != nil {
		t.Fatal(err)
	}
	if _, err := repo.ConsumeEmailToken(ctx, purposeVerifyEmail, verify); !errors.Is(err, ErrInvalidEmailToken) {
		t.Fatalf("confirmação depois de invalidar: erro %v", err)
	}
	if _, err := repo.ConsumeEmailToken(ctx, purposeResetPassword, reset); !errors.Is(err, ErrInvalidEmailToken) {
		t.Fatalf("reset depois de invalidar: erro %v", err)
	}
	if _, err := repo.ConsumeEmailToken(ctx, purposeVerifyEmail, others); err != nil {
		t.Fatalf("o link de outra conta não pode cair junto: %v", err)
	}
}

func TestDBExpiredLinkIsInvalidButKeepsItsOwner(t *testing.T) {
	db, repo := emailTokensDB(t)
	ctx := context.Background()
	id := insertTokenOwner(t, db)
	h := newTokenHash()
	if err := repo.AddEmailToken(ctx, id, purposeVerifyEmail, h, time.Now().Add(-time.Second)); err != nil {
		t.Fatal(err)
	}

	if _, err := repo.ConsumeEmailToken(ctx, purposeVerifyEmail, h); !errors.Is(err, ErrInvalidEmailToken) {
		t.Fatalf("link vencido: erro %v, quer ErrInvalidEmailToken", err)
	}
	if owner, err := repo.EmailTokenOwner(ctx, purposeVerifyEmail, h); err != nil || owner != id {
		t.Fatalf("dono do link vencido: %q, %v", owner, err)
	}
	if _, err := repo.EmailTokenOwner(ctx, purposeResetPassword, h); !errors.Is(err, ErrInvalidEmailToken) {
		t.Fatalf("outra finalidade: erro %v, quer ErrInvalidEmailToken", err)
	}
	if _, err := repo.EmailTokenOwner(ctx, purposeVerifyEmail, newTokenHash()); !errors.Is(err, ErrInvalidEmailToken) {
		t.Fatalf("link que nunca existiu: erro %v, quer ErrInvalidEmailToken", err)
	}
}
