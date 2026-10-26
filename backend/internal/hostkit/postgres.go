package hostkit

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5"
)

// InitDB cria o pgdata com o usuário concord e a senha do .env (senha em
// arquivo temporário, apagado logo depois: nunca na linha de comando).
func InitDB(l Layout, password string) error {
	if _, err := os.Stat(filepath.Join(l.PgData(), "PG_VERSION")); err == nil {
		return nil // já criado (setup rodando de novo)
	}
	if err := os.MkdirAll(l.Data(), 0o700); err != nil {
		return err
	}
	pwfile := filepath.Join(l.Data(), ".pgpass-init")
	if err := os.WriteFile(pwfile, []byte(password+"\n"), 0o600); err != nil {
		return err
	}
	defer os.Remove(pwfile)
	// Sobrou de um setup interrompido: o initdb recusa pasta que não está vazia.
	_ = os.RemoveAll(l.PgData())
	cmd := exec.Command(l.PgBin("initdb"),
		"-D", l.PgData(),
		"-U", dbUser,
		"--pwfile="+pwfile,
		"-A", "scram-sha-256",
		"-E", "UTF8",
		"--no-locale",
	)
	prepareChild(cmd)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("initdb: %w: %s", err, tail(out))
	}
	return nil
}

// postgresCommand é o postmaster como filho do supervisor (só em 127.0.0.1).
func postgresCommand(l Layout, port int) *exec.Cmd {
	return exec.Command(l.PgBin("postgres"),
		"-D", l.PgData(),
		"-p", strconv.Itoa(port),
		"-c", "listen_addresses=127.0.0.1",
	)
}

// stopPostgres pede o desligamento rápido (fecha conexões, faz checkpoint).
func stopPostgres(l Layout) error {
	cmd := exec.Command(l.PgBin("pg_ctl"), "stop", "-D", l.PgData(), "-m", "fast", "-w", "-t", "30")
	prepareChild(cmd)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("pg_ctl stop: %w: %s", err, tail(out))
	}
	return nil
}

// waitPostgres espera o banco aceitar login (no banco "postgres", que sempre existe).
func waitPostgres(ctx context.Context, port int, password string, wait time.Duration) error {
	url := fmt.Sprintf("postgres://%s:%s@127.0.0.1:%d/postgres?sslmode=disable", dbUser, password, port)
	deadline := time.Now().Add(wait)
	for {
		attempt, cancel := context.WithTimeout(ctx, 2*time.Second)
		conn, err := pgx.Connect(attempt, url)
		cancel()
		if err == nil {
			_ = conn.Close(ctx)
			return nil
		}
		if time.Now().After(deadline) || ctx.Err() != nil {
			return fmt.Errorf("o banco não respondeu: %w", err)
		}
		time.Sleep(300 * time.Millisecond)
	}
}

// CreateDatabase cria o banco concord (o Postgres portátil não traz psql).
func CreateDatabase(ctx context.Context, port int, password string) error {
	url := fmt.Sprintf("postgres://%s:%s@127.0.0.1:%d/postgres?sslmode=disable", dbUser, password, port)
	conn, err := pgx.Connect(ctx, url)
	if err != nil {
		return err
	}
	defer conn.Close(ctx)
	var exists bool
	if err := conn.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname = $1)`, dbName).Scan(&exists); err != nil {
		return err
	}
	if exists {
		return nil
	}
	_, err = conn.Exec(ctx, `CREATE DATABASE `+pgx.Identifier{dbName}.Sanitize()+` ENCODING 'UTF8'`)
	return err
}

// ActiveCallers conta quem está numa chamada agora (a atualização espera zerar).
func ActiveCallers(ctx context.Context, databaseURL string) (int, error) {
	conn, err := pgx.Connect(ctx, databaseURL)
	if err != nil {
		return 0, err
	}
	defer conn.Close(ctx)
	// A mesma conta do scripts/apply-caddyfile.sh.
	var n int
	err = conn.QueryRow(ctx, `SELECT count(*) FROM call_participants p JOIN calls c ON c.id = p.call_id
		WHERE p.left_at IS NULL AND c.status <> 'ended'`).Scan(&n)
	return n, err
}

// tail: o fim da saída de um comando, para a mensagem de erro.
func tail(out []byte) string {
	const max = 600
	if len(out) > max {
		out = out[len(out)-max:]
	}
	return string(out)
}
