package hostkit

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"time"
)

// SetupOptions do "salinha-host setup" (roda na VPS como o usuário do
// serviço, entre o prepare-system e o finish-system do deploy).
type SetupOptions struct {
	AutoUpdate bool
	VPS        VPSOptions
	// Start: já liga o supervisor no fim (testes sem o finish-system).
	Start bool
}

// Setup deixa o servidor pronto, contando cada etapa em eventos:
// configuração (portas livres, segredos), banco (initdb, banco e migrations)
// e HTTPS (Caddyfile com o endereço público). Pode rodar de novo: o que já
// existe (segredos, banco, certificados) fica.
func Setup(ctx context.Context, l Layout, opts SetupOptions, em *Emitter) error {
	fail := func(step string, err error) error {
		em.Step(step, "error", err.Error())
		return err
	}

	network, err := vpsNetwork(opts.VPS)
	if err != nil {
		return fail("setup", err)
	}

	// Já no ar (setup de novo): para antes, senão as portas estão ocupadas.
	if _, err := ControlStatus(l); err == nil {
		if err := ControlStop(l, 60*time.Second); err != nil {
			return fail("setup", err)
		}
	}

	em.Step("setup", "running", "Preparando as pastas e as configurações")
	cfg, err := prepareConfig(l, opts)
	if err != nil {
		return fail("setup", err)
	}
	em.Step("setup", "done", "")

	em.Step("database", "running", "Criando o banco de dados")
	if err := prepareDatabase(ctx, l, cfg); err != nil {
		return fail("database", err)
	}
	em.Step("database", "done", "")

	em.Step("https", "running", "Preparando o HTTPS")
	if err := ApplyNetwork(l, network, opts.VPS.TLSInternal); err != nil {
		return fail("https", err)
	}
	em.Step("https", "done", "")

	if !opts.Start {
		return nil
	}
	em.Step("start", "running", "Ligando o servidor")
	if _, err := StartAndWait(l, 4*time.Minute); err != nil {
		return fail("start", err)
	}
	em.Step("start", "done", "")
	em.Emit(Event{Type: "ready", PublicURL: network.PublicURL, Mode: network.Mode})
	return nil
}

// prepareConfig escolhe portas e segredos na primeira vez; depois reaproveita.
func prepareConfig(l Layout, opts SetupOptions) (HostConfig, error) {
	for _, dir := range []string{l.Data(), l.Logs()} {
		if err := os.MkdirAll(dir, 0o700); err != nil {
			return HostConfig{}, err
		}
	}
	if cfg, err := ReadHostConfig(l.HostFile()); err == nil {
		if _, err := os.Stat(l.EnvFile()); err == nil {
			cfg.AutoUpdate = opts.AutoUpdate
			return cfg, WriteHostConfig(l.HostFile(), cfg)
		}
	}
	ports, err := PickPorts(DefaultPorts, PortFree)
	if err != nil {
		return HostConfig{}, err
	}
	secrets, err := NewSecrets()
	if err != nil {
		return HostConfig{}, err
	}
	if err := writeFileAtomic(l.EnvFile(), []byte(RenderEnv(ports, secrets, Network{})), 0o600); err != nil {
		return HostConfig{}, err
	}
	cfg := HostConfig{Ports: ports, AutoUpdate: opts.AutoUpdate}
	if err := writeLiveKitConfig(l, ports, ""); err != nil {
		return cfg, err
	}
	return cfg, WriteHostConfig(l.HostFile(), cfg)
}

// prepareDatabase: initdb (uma vez), banco concord e migrations, com um
// Postgres temporário que para no fim.
func prepareDatabase(ctx context.Context, l Layout, cfg HostConfig) error {
	password := dbPassword(EnvValue(l.EnvFile(), "DATABASE_URL"))
	if password == "" {
		return errors.New("DATABASE_URL sem senha no .env")
	}
	if err := InitDB(l, password); err != nil {
		return err
	}
	logFile, err := openLog(filepath.Join(l.Logs(), "postgres.log"))
	if err != nil {
		return err
	}
	defer logFile.Close()
	pg := postgresCommand(l, cfg.Ports.Postgres)
	pg.Stdout, pg.Stderr = logFile, logFile
	prepareChild(pg)
	if err := pg.Start(); err != nil {
		return fmt.Errorf("postgres não abriu: %w", err)
	}
	adoptChild(pg.Process)
	exited := make(chan struct{})
	go func() { _ = pg.Wait(); close(exited) }()
	defer func() {
		if err := stopPostgres(l); err != nil {
			_ = pg.Process.Kill()
		}
		select {
		case <-exited:
		case <-time.After(30 * time.Second):
			_ = pg.Process.Kill()
		}
	}()

	// Postgres que fecha logo (porta ocupada, pgdata estragado) não deixa a
	// espera ir até o fim.
	waitCtx, cancelWait := context.WithCancel(ctx)
	defer cancelWait()
	go func() {
		select {
		case <-exited:
			cancelWait()
		case <-waitCtx.Done():
		}
	}()
	if err := waitPostgres(waitCtx, cfg.Ports.Postgres, password, 60*time.Second); err != nil {
		select {
		case <-exited:
			return fmt.Errorf("o Postgres fechou ao abrir (veja %s)", filepath.Join(l.Logs(), "postgres.log"))
		default:
		}
		return err
	}
	if err := CreateDatabase(ctx, cfg.Ports.Postgres, password); err != nil {
		return fmt.Errorf("criar o banco: %w", err)
	}
	return migrate(l)
}

// migrate roda "concord-server migrate" (aplica as migrations e sai).
func migrate(l Layout) error {
	cmd := exec.Command(l.Bin("concord-server"), "migrate")
	cmd.Dir = l.Data()
	cmd.Env = append(os.Environ(), "MIGRATIONS_DIR="+l.Migrations(), "UPDATES_DIR="+l.Updates())
	prepareChild(cmd)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("migrations: %w: %s", err, tail(out))
	}
	return nil
}

// StartDetached abre o supervisor (salinha-host run): pelo serviço do systemd
// quando ele existe (VPS), senão em segundo plano, vivo depois que o setup sai.
func StartDetached(l Layout) error {
	if started, err := startService(l); started || err != nil {
		return err
	}
	cmd := exec.Command(l.Bin("salinha-host"), "run", "--root", l.Root)
	cmd.Dir = l.Data()
	prepareDetached(cmd)
	if err := cmd.Start(); err != nil {
		return err
	}
	return cmd.Process.Release()
}

// allRunning: supervisor pronto e os serviços no ar (não reiniciando).
func allRunning(st Status) bool {
	if st.State != "running" {
		return false
	}
	for _, name := range []string{"postgres", "livekit", "backend", "caddy"} {
		if st.Services[name] != svcRunning {
			return false
		}
	}
	return true
}

// StartAndWait sobe o supervisor (se não estiver no ar) e espera tudo pronto.
func StartAndWait(l Layout, wait time.Duration) (Status, error) {
	if _, err := ControlStatus(l); err != nil {
		if err := StartDetached(l); err != nil {
			return Status{}, err
		}
	}
	return WaitReady(l, wait)
}

// WaitReady só espera o supervisor (já iniciado por outro) ficar pronto.
func WaitReady(l Layout, wait time.Duration) (Status, error) {
	deadline := time.Now().Add(wait)
	for time.Now().Before(deadline) {
		if st, err := ControlStatus(l); err == nil && allRunning(st) {
			return st, nil
		}
		time.Sleep(500 * time.Millisecond)
	}
	return Status{}, fmt.Errorf("o servidor não ficou pronto em %s (veja %s)", wait, l.Logs())
}
