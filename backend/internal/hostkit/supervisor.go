package hostkit

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

// Estados de cada serviço (Status.Services).
const (
	svcStarting   = "starting"
	svcRunning    = "running"
	svcRestarting = "restarting"
	svcStopped    = "stopped"
)

// Status é o que o painel de controle (control.go) responde em GET /status.
type Status struct {
	// State: "starting", "running" ou "stopping".
	State     string            `json:"state"`
	Services  map[string]string `json:"services"`
	LocalURL  string            `json:"localUrl"`
	PublicURL string            `json:"publicUrl"`
	Mode      string            `json:"mode"`
	Version   string            `json:"version"`
}

// service é um processo filho com o jeito de saber que ficou pronto e de
// parar com calma.
type service struct {
	name  string
	build func() (*exec.Cmd, error)
	ready func(ctx context.Context) error
	// stop pede o desligamento; quem chama mata se não sair em stopWait.
	stop     func(cmd *exec.Cmd, stdin io.Closer)
	stopWait time.Duration
	restart  chan struct{}
}

// Supervisor mantém Postgres, LiveKit e backend no ar.
type Supervisor struct {
	l       Layout
	version string

	mu       sync.Mutex
	state    string
	services map[string]string
	cfg      HostConfig

	// update: de onde vem a versão nova; stopForUpdate desliga tudo para o
	// updater assumir (WithUpdates).
	update        UpdateConfig
	stopForUpdate func()
}

// WithUpdates liga a atualização automática pelo GitHub Releases; stop desliga
// o supervisor quando a versão nova está pronta para o updater aplicar.
func (s *Supervisor) WithUpdates(cfg UpdateConfig, stop func()) *Supervisor {
	s.update = cfg
	s.stopForUpdate = stop
	return s
}

func NewSupervisor(l Layout, version string) *Supervisor {
	return &Supervisor{l: l, version: version, state: "starting", services: map[string]string{}}
}

func (s *Supervisor) setService(name, state string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.services[name] = state
}

func (s *Supervisor) setState(state string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.state = state
}

func (s *Supervisor) Status() Status {
	s.mu.Lock()
	defer s.mu.Unlock()
	services := make(map[string]string, len(s.services))
	for k, v := range s.services {
		services[k] = v
	}
	return Status{
		State:     s.state,
		Services:  services,
		LocalURL:  fmt.Sprintf("http://127.0.0.1:%d", s.cfg.Ports.Backend),
		PublicURL: s.cfg.Network.PublicURL,
		Mode:      s.cfg.Network.Mode,
		Version:   s.version,
	}
}

// Run sobe tudo e só volta quando ctx acaba (e tudo já parou). restart pede
// para reiniciar LiveKit e backend (a rede mudou: novo node_ip/PUBLIC_URL).
func (s *Supervisor) Run(ctx context.Context, restart <-chan struct{}) error {
	cfg, err := ReadHostConfig(s.l.HostFile())
	if err != nil {
		return fmt.Errorf("servidor não configurado (rode o setup): %w", err)
	}
	s.mu.Lock()
	s.cfg = cfg
	s.mu.Unlock()
	if err := os.MkdirAll(s.l.Logs(), 0o700); err != nil {
		return err
	}
	password := dbPassword(EnvValue(s.l.EnvFile(), "DATABASE_URL"))

	pg := &service{
		name:  "postgres",
		build: func() (*exec.Cmd, error) { return postgresCommand(s.l, cfg.Ports.Postgres), nil },
		ready: func(ctx context.Context) error {
			return waitPostgres(ctx, cfg.Ports.Postgres, password, 60*time.Second)
		},
		stop:     func(*exec.Cmd, io.Closer) { _ = stopPostgres(s.l) },
		stopWait: 35 * time.Second,
	}
	lk := &service{
		name: "livekit",
		build: func() (*exec.Cmd, error) {
			return exec.Command(s.l.Bin("livekit-server"), "--config", s.l.LiveKitFile()), nil
		},
		ready: func(ctx context.Context) error {
			return waitHTTP(ctx, fmt.Sprintf("http://127.0.0.1:%d/", cfg.Ports.LiveKit), 30*time.Second)
		},
		stop:     func(cmd *exec.Cmd, _ io.Closer) { _ = terminate(cmd.Process) },
		stopWait: 5 * time.Second,
		restart:  make(chan struct{}, 1),
	}
	be := &service{
		name:  "backend",
		build: func() (*exec.Cmd, error) { return s.backendCommand(), nil },
		ready: func(ctx context.Context) error {
			return waitHTTP(ctx, fmt.Sprintf("http://127.0.0.1:%d/healthz", cfg.Ports.Backend), 90*time.Second)
		},
		// Fechar o stdin = desligamento com calma (STOP_ON_STDIN_EOF no backend).
		stop: func(cmd *exec.Cmd, stdin io.Closer) {
			if stdin != nil {
				_ = stdin.Close()
			}
		},
		stopWait: 15 * time.Second,
		restart:  make(chan struct{}, 1),
	}
	// HTTPS na frente (certificado do sslip.io ou do domínio, renovado sozinho).
	cd := &service{
		name:  "caddy",
		build: func() (*exec.Cmd, error) { return s.caddyCommand(), nil },
		ready: func(ctx context.Context) error {
			return waitHTTP(ctx, fmt.Sprintf("http://127.0.0.1:%d/config/", caddyAdminPort), 30*time.Second)
		},
		stop:     func(cmd *exec.Cmd, _ io.Closer) { _ = terminate(cmd.Process) },
		stopWait: 10 * time.Second,
		restart:  make(chan struct{}, 1),
	}

	// Cada um com o próprio contexto: desliga na ordem inversa da subida.
	pgCtx, pgCancel := context.WithCancel(context.Background())
	lkCtx, lkCancel := context.WithCancel(context.Background())
	beCtx, beCancel := context.WithCancel(context.Background())
	cdCtx, cdCancel := context.WithCancel(context.Background())
	var wg sync.WaitGroup
	keep := func(svcCtx context.Context, svc *service, up chan<- error) {
		wg.Add(1)
		go func() {
			defer wg.Done()
			s.keep(svcCtx, svc, up)
		}()
	}

	up := make(chan error, 1)
	keep(pgCtx, pg, up)
	err = s.waitUp(ctx, up)
	if err == nil {
		up = make(chan error, 1)
		keep(lkCtx, lk, up)
		err = s.waitUp(ctx, up)
	}
	if err == nil {
		up = make(chan error, 1)
		keep(beCtx, be, up)
		err = s.waitUp(ctx, up)
	}
	if err == nil {
		up = make(chan error, 1)
		keep(cdCtx, cd, up)
		err = s.waitUp(ctx, up)
	}
	if err == nil {
		s.setState("running")
		log.Printf("servidor no ar em %s", cfg.Network.PublicURL)
		// Subiu inteira: uma versão recém-atualizada fica valendo.
		ConfirmUpdate(s.l)
		if s.stopForUpdate != nil {
			go s.autoUpdate(ctx, s.update, s.stopForUpdate)
		}
	loop:
		for {
			select {
			case <-ctx.Done():
				break loop
			case <-restart:
				// Configuração mudou (deploy de novo): relê e reinicia o que lê ela.
				if fresh, err := ReadHostConfig(s.l.HostFile()); err == nil {
					s.mu.Lock()
					s.cfg.Network = fresh.Network
					s.mu.Unlock()
				}
				nudge(lk.restart)
				nudge(be.restart)
				nudge(cd.restart)
			}
		}
	}

	s.setState("stopping")
	cdCancel()
	waitService(s, "caddy", cd.stopWait+time.Second)
	beCancel()
	waitService(s, "backend", be.stopWait+time.Second)
	lkCancel()
	waitService(s, "livekit", lk.stopWait+time.Second)
	pgCancel()
	wg.Wait()
	return err
}

// caddyCommand: certificados e configuração do Caddy em data/caddy.
func (s *Supervisor) caddyCommand() *exec.Cmd {
	cmd := exec.Command(s.l.Bin("caddy"), "run", "--config", s.l.CaddyFile(), "--adapter", "caddyfile")
	cmd.Dir = s.l.Data()
	cmd.Env = append(os.Environ(),
		"XDG_DATA_HOME="+s.l.CaddyData(),
		"XDG_CONFIG_HOME="+s.l.CaddyData(),
		"HOME="+s.l.Root,
	)
	return cmd
}

func nudge(ch chan struct{}) {
	select {
	case ch <- struct{}{}:
	default:
	}
}

// waitService espera o serviço chegar a "stopped" (desligamento em ordem).
func waitService(s *Supervisor, name string, max time.Duration) {
	deadline := time.Now().Add(max)
	for time.Now().Before(deadline) {
		s.mu.Lock()
		state := s.services[name]
		s.mu.Unlock()
		if state == "" || state == svcStopped {
			return
		}
		time.Sleep(100 * time.Millisecond)
	}
}

func (s *Supervisor) waitUp(ctx context.Context, up <-chan error) error {
	select {
	case err := <-up:
		return err
	case <-ctx.Done():
		return ctx.Err()
	}
}

// backoff entre reinícios de um serviço que caiu.
var backoff = []time.Duration{time.Second, 2 * time.Second, 5 * time.Second, 10 * time.Second, 30 * time.Second}

// keep roda o serviço até ctx acabar, reiniciando quando cai. A primeira
// subida (pronto ou não) vai em up.
func (s *Supervisor) keep(ctx context.Context, svc *service, up chan<- error) {
	failures := 0
	first := true
	report := func(err error) {
		if first {
			first = false
			up <- err
		}
	}
	defer s.setService(svc.name, svcStopped)
	for {
		s.setService(svc.name, svcStarting)
		cmd, stdin, done, err := s.start(svc)
		if err != nil {
			log.Printf("[%s] não subiu: %v", svc.name, err)
			report(fmt.Errorf("%s não subiu: %w", svc.name, err))
		} else {
			readyCtx, cancelReady := context.WithCancel(ctx)
			readyErr := make(chan error, 1)
			go func() { readyErr <- svc.ready(readyCtx) }()

			exited := false
			restartAsked := false
		wait:
			for {
				select {
				case err := <-readyErr:
					readyErr = nil
					if err != nil {
						log.Printf("[%s] não ficou pronto: %v", svc.name, err)
						report(fmt.Errorf("%s não ficou pronto: %w", svc.name, err))
						break wait
					}
					failures = 0
					s.setService(svc.name, svcRunning)
					report(nil)
				case <-done:
					exited = true
					break wait
				case <-svc.restart:
					restartAsked = true
					break wait
				case <-ctx.Done():
					break wait
				}
			}
			cancelReady()
			if !exited {
				svc.stop(cmd, stdin)
				select {
				case <-done:
				case <-time.After(svc.stopWait):
					log.Printf("[%s] não parou em %s; encerrando à força", svc.name, svc.stopWait)
					_ = cmd.Process.Kill()
					<-done
				}
			}
			if restartAsked {
				s.setService(svc.name, svcRestarting)
				continue
			}
		}
		if ctx.Err() != nil {
			return
		}
		delay := backoff[min(failures, len(backoff)-1)]
		failures++
		s.setService(svc.name, svcRestarting)
		log.Printf("[%s] caiu; tentando de novo em %s", svc.name, delay)
		select {
		case <-time.After(delay):
		case <-ctx.Done():
			return
		}
	}
}

// start abre o processo com o log em data/logs/<nome>.log.
func (s *Supervisor) start(svc *service) (*exec.Cmd, io.WriteCloser, <-chan struct{}, error) {
	cmd, err := svc.build()
	if err != nil {
		return nil, nil, nil, err
	}
	logFile, err := openLog(filepath.Join(s.l.Logs(), svc.name+".log"))
	if err != nil {
		return nil, nil, nil, err
	}
	cmd.Stdout = logFile
	cmd.Stderr = logFile
	var stdin io.WriteCloser
	if svc.name == "backend" {
		if stdin, err = cmd.StdinPipe(); err != nil {
			_ = logFile.Close()
			return nil, nil, nil, err
		}
	}
	prepareChild(cmd)
	if err := cmd.Start(); err != nil {
		_ = logFile.Close()
		return nil, nil, nil, err
	}
	adoptChild(cmd.Process)
	done := make(chan struct{})
	go func() {
		err := cmd.Wait()
		_ = logFile.Close()
		if err != nil && !errors.Is(err, os.ErrProcessDone) {
			log.Printf("[%s] saiu: %v", svc.name, err)
		}
		close(done)
	}()
	return cmd, stdin, done, nil
}

// backendCommand: roda em data/ (lê o .env e grava uploads/ ali); migrations e
// atualizações vêm do pacote atual.
func (s *Supervisor) backendCommand() *exec.Cmd {
	cmd := exec.Command(s.l.Bin("concord-server"))
	cmd.Dir = s.l.Data()
	env := os.Environ()
	// ffmpeg/yt-dlp do pacote (Maestro), se vierem: antes do PATH do sistema.
	tools := filepath.Join(s.l.App(), "bin", "tools")
	if _, err := os.Stat(tools); err == nil {
		env = prependPath(env, tools)
	}
	cmd.Env = append(env,
		"MIGRATIONS_DIR="+s.l.Migrations(),
		"UPDATES_DIR="+s.l.Updates(),
		"STOP_ON_STDIN_EOF=1",
	)
	return cmd
}

func prependPath(env []string, dir string) []string {
	for i, kv := range env {
		k, v, ok := strings.Cut(kv, "=")
		if ok && strings.EqualFold(k, "PATH") {
			env[i] = k + "=" + dir + string(os.PathListSeparator) + v
			return env
		}
	}
	return append(env, "PATH="+dir)
}

const logMaxBytes = 5 << 20

// openLog abre em modo append; acima de 5 MB guarda o antigo como .1.
func openLog(path string) (*os.File, error) {
	if info, err := os.Stat(path); err == nil && info.Size() > logMaxBytes {
		_ = os.Rename(path, path+".1")
	}
	return os.OpenFile(path, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o600)
}

// waitHTTP espera um 200 no endereço.
func waitHTTP(ctx context.Context, target string, wait time.Duration) error {
	client := &http.Client{Timeout: 2 * time.Second}
	deadline := time.Now().Add(wait)
	for {
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, target, nil)
		if err != nil {
			return err
		}
		res, err := client.Do(req)
		if err == nil {
			_, _ = io.Copy(io.Discard, res.Body)
			_ = res.Body.Close()
			if res.StatusCode == http.StatusOK {
				return nil
			}
			err = fmt.Errorf("status %d", res.StatusCode)
		}
		if time.Now().After(deadline) || ctx.Err() != nil {
			return fmt.Errorf("%s não respondeu: %w", target, err)
		}
		time.Sleep(300 * time.Millisecond)
	}
}

// dbPassword tira a senha do DATABASE_URL do .env.
func dbPassword(databaseURL string) string {
	u, err := url.Parse(databaseURL)
	if err != nil || u.User == nil {
		return ""
	}
	pw, _ := u.User.Password()
	return pw
}
