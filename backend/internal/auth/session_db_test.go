package auth

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
)

// Num Postgres de verdade (TEST_DATABASE_URL, banco descartável e migrado).

func TestDBHashDoRefreshIgualAoDaMigration(t *testing.T) {
	db, _ := emailTokensDB(t)
	token := "eyJ.um-refresh-token.qualquer"
	var fromSQL string
	if err := db.QueryRow(context.Background(), `SELECT encode(sha256(convert_to($1, 'UTF8')), 'hex')`, token).Scan(&fromSQL); err != nil {
		t.Fatal(err)
	}
	if got := hashRefreshToken(token); got != fromSQL {
		t.Fatalf("Go = %s, SQL da migration 000185 = %s: os tokens convertidos não seriam achados", got, fromSQL)
	}
}

func TestDBRefreshUsoUnicoMesmoAoMesmoTempo(t *testing.T) {
	db, repo := emailTokensDB(t)
	userID := insertTokenOwner(t, db)
	s := NewService(repo, []byte("segredo-de-teste-com-32-bytes-ok"))
	s.SetSessionVersions(NewVersionCache(repo, time.Minute))
	ctx := context.Background()
	refresh, err := s.GenerateRefreshToken(ctx, userID)
	if err != nil {
		t.Fatal(err)
	}
	var stored int
	db.QueryRow(ctx, `SELECT count(*) FROM refresh_tokens WHERE user_id = $1 AND token_hash = $2`, userID, hashRefreshToken(refresh)).Scan(&stored)
	if stored != 1 {
		t.Fatalf("hash guardado %d vezes, quer 1 (e nunca o texto)", stored)
	}

	var wg sync.WaitGroup
	var mu sync.Mutex
	wins := 0
	for range 5 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if _, _, err := s.RefreshTokens(ctx, refresh); err == nil {
				mu.Lock()
				wins++
				mu.Unlock()
			} else if !errors.Is(err, ErrInvalidRefresh) {
				t.Errorf("RefreshTokens: %v", err)
			}
		}()
	}
	wg.Wait()
	if wins != 1 {
		t.Fatalf("%d renovações com o mesmo refresh token, quer 1", wins)
	}
}

func TestDBRevokeAllDerrubaTokensEMudaAVersao(t *testing.T) {
	db, repo := emailTokensDB(t)
	userID := insertTokenOwner(t, db)
	s := NewService(repo, []byte("segredo-de-teste-com-32-bytes-ok"))
	s.SetSessionVersions(NewVersionCache(repo, time.Minute))
	ctx := context.Background()
	access, _ := s.GenerateAccessToken(ctx, userID)
	refresh, _ := s.GenerateRefreshToken(ctx, userID)
	claims, _ := s.ValidateToken(access)
	if _, err := db.Exec(ctx, `INSERT INTO push_tokens (user_id, token, platform) VALUES ($1, $2, 'android')`, userID, "fcm-"+userID); err != nil {
		t.Fatal(err)
	}
	var revoked []string
	s.OnSessionsRevoked(func(id string) { revoked = append(revoked, id) })

	if err := s.RevokeAllSessions(ctx, userID); err != nil {
		t.Fatal(err)
	}

	if err := s.CheckSession(ctx, claims); !errors.Is(err, ErrSessionRevoked) {
		t.Errorf("token de acesso de antes: %v, quer ErrSessionRevoked", err)
	}
	if _, _, err := s.RefreshTokens(ctx, refresh); !errors.Is(err, ErrInvalidRefresh) {
		t.Errorf("refresh de antes: %v, quer ErrInvalidRefresh", err)
	}
	var pushes int
	db.QueryRow(ctx, `SELECT count(*) FROM push_tokens WHERE user_id = $1`, userID).Scan(&pushes)
	if pushes != 0 {
		t.Errorf("o aparelho deslogado continuaria recebendo push (%d token)", pushes)
	}
	if len(revoked) != 1 || revoked[0] != userID {
		t.Errorf("ganchos: %v", revoked)
	}
	if _, err := repo.TokenVersion(ctx, uuid.NewString()); !errors.Is(err, ErrSessionRevoked) {
		t.Errorf("conta que não existe: %v, quer ErrSessionRevoked", err)
	}
}

func TestDBLogoutDesteDispositivoELimpezaDosVencidos(t *testing.T) {
	db, repo := emailTokensDB(t)
	userID := insertTokenOwner(t, db)
	s := NewService(repo, []byte("segredo-de-teste-com-32-bytes-ok"))
	ctx := context.Background()
	here, _ := s.GenerateRefreshToken(ctx, userID)
	other, _ := s.GenerateRefreshToken(ctx, userID)

	if err := s.Logout(ctx, userID, here); err != nil {
		t.Fatal(err)
	}
	if _, err := repo.ConsumeRefreshToken(ctx, hashRefreshToken(here)); !errors.Is(err, ErrInvalidRefresh) {
		t.Errorf("o deste dispositivo continua: %v", err)
	}

	// O outro dispositivo segue; vencido, sai na limpeza.
	if _, err := db.Exec(ctx, `UPDATE refresh_tokens SET expires_at = NOW() - interval '1 minute' WHERE token_hash = $1`, hashRefreshToken(other)); err != nil {
		t.Fatal(err)
	}
	if n, err := repo.DeleteExpiredRefreshTokens(ctx, time.Now()); err != nil || n < 1 {
		t.Fatalf("limpeza = %d, %v", n, err)
	}
	var left int
	db.QueryRow(ctx, `SELECT count(*) FROM refresh_tokens WHERE user_id = $1`, userID).Scan(&left)
	if left != 0 {
		t.Errorf("sobraram %d refresh tokens", left)
	}
}
