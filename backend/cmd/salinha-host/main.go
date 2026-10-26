// salinha-host é o "Salinha Servidor": instala a Salinha inteira numa VPS
// (Postgres portátil, LiveKit, backend e Caddy com HTTPS) e a mantém no ar.
//
// No computador de quem hospeda (o app chama):
//
//	salinha-host deploy        instala na VPS pelo SSH (opções em JSON no stdin)
//
// Na VPS (o deploy chama, nesta ordem):
//
//	salinha-host prepare-system                         root: usuário "salinha", pasta, Maestro
//	salinha-host setup --public-ip IP [--domain D] [--auto-update]   como "salinha": config, banco, HTTPS
//	salinha-host finish-system                          root: firewall, serviço do systemd, liga
//
// E o serviço do systemd:
//
//	salinha-host pre-start     aplica ou desfaz uma atualização (ExecStartPre)
//	salinha-host run           supervisor (fica rodando)
//	salinha-host status|stop|update
//
// Os eventos de andamento saem em JSON no stdout (internal/hostkit/events.go).
// Todos aceitam --root <pasta> (padrão na VPS: /opt/salinha-server).
package main

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"log"
	"os"
	"os/signal"
	"path/filepath"
	"runtime"
	"syscall"
	"time"

	"gin-quickstart/backend/internal/hostkit"
)

// Vêm do build (-ldflags "-X main.version=… -X main.updatePubKey=…"):
// updatePubKey é a chave pública Ed25519 (PEM em base64, uma linha) que assina
// os pacotes do servidor; vazia = sem deploy nem atualização automática.
var (
	version      = "dev"
	updatePubKey = ""
	releasesURL  = "https://github.com/hugoemannuel/concord/releases"
)

func updateConfig() hostkit.UpdateConfig {
	pem, err := base64.StdEncoding.DecodeString(updatePubKey)
	if err != nil {
		pem = nil
	}
	return hostkit.UpdateConfig{ReleasesURL: releasesURL, PublicKeyPEM: string(pem), Version: version}
}

func main() {
	if len(os.Args) < 2 {
		usage()
	}
	cmd, args := os.Args[1], os.Args[2:]
	fs := flag.NewFlagSet(cmd, flag.ExitOnError)
	root := fs.String("root", "", "pasta do servidor")
	autoUpdate := fs.Bool("auto-update", false, "atualizar sozinho pelo GitHub Releases")
	publicIP := fs.String("public-ip", "", "IP público da VPS")
	domain := fs.String("domain", "", "domínio próprio (opcional; padrão <ip>.sslip.io)")
	tlsInternal := fs.Bool("tls-internal", false, "certificado da CA interna do Caddy (só testes)")
	start := fs.Bool("start", false, "setup: já liga o servidor no fim (testes)")
	_ = fs.Parse(args)

	l, err := layout(*root)
	if err != nil {
		fatal(err)
	}
	em := hostkit.NewEmitter(os.Stdout)
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	switch cmd {
	case "deploy":
		var opts hostkit.DeployOptions
		input, err := io.ReadAll(io.LimitReader(os.Stdin, 1<<20))
		if err == nil {
			// Sem o BOM que alguns terminais (PowerShell) põem no começo.
			err = json.Unmarshal(bytes.TrimPrefix(input, []byte("\xef\xbb\xbf")), &opts)
		}
		if err != nil {
			emitFatal(em, fmt.Errorf("opções do deploy inválidas: %w", err))
		}
		// Só testes (scripts/e2e-instalador.mjs): VPS falsa num contêiner local.
		if ip := os.Getenv("SALINHA_DEPLOY_PUBLIC_IP"); ip != "" {
			opts.PublicIP = ip
		}
		if os.Getenv("SALINHA_DEPLOY_TLS_INTERNAL") == "1" {
			opts.TLSInternal = true
		}
		if _, err := hostkit.Deploy(ctx, opts, updateConfig(), em); err != nil {
			emitFatal(em, err)
		}
	case "prepare-system":
		em.Step("setup", "running", "Preparando a VPS")
		warning, err := hostkit.PrepareSystem(l)
		if err != nil {
			em.Step("setup", "error", err.Error())
			os.Exit(1)
		}
		if warning != "" {
			em.Emit(hostkit.Event{Type: "step", Step: "setup", State: "running", Warning: warning})
		}
	case "setup":
		opts := hostkit.SetupOptions{
			AutoUpdate: *autoUpdate,
			Start:      *start,
			VPS:        hostkit.VPSOptions{PublicIP: *publicIP, Domain: *domain, TLSInternal: *tlsInternal},
		}
		if err := hostkit.Setup(ctx, l, opts, em); err != nil {
			os.Exit(1) // a etapa já mandou o evento de erro
		}
	case "finish-system":
		em.Step("start", "running", "Ligando o servidor")
		warning, err := hostkit.FinishSystem(l)
		if warning != "" {
			em.Emit(hostkit.Event{Type: "step", Step: "start", State: "running", Warning: warning})
		}
		if err == nil {
			// Quem liga é o systemd (ou o FinishSystem, sem systemd): aqui só espera.
			_, err = hostkit.WaitReady(l, 4*time.Minute)
		}
		if err != nil {
			em.Step("start", "error", err.Error())
			os.Exit(1)
		}
		em.Step("start", "done", "")
	case "pre-start":
		logTo(l, "update.log")
		if err := hostkit.PreStart(l); err != nil {
			// Não impede a partida: sobe a versão que estiver em app/.
			log.Printf("[update] pre-start: %v", err)
		}
	case "run":
		if err := run(ctx, stop, l); err != nil {
			if errors.Is(err, hostkit.ErrAlreadyRunning) {
				log.Print(err)
				return
			}
			fatal(err)
		}
	case "status":
		st, err := hostkit.ControlStatus(l)
		if err != nil {
			fmt.Println(`{"state":"stopped"}`)
			return
		}
		_ = json.NewEncoder(os.Stdout).Encode(st)
	case "stop":
		if err := hostkit.StopSystem(l); err != nil {
			fatal(err)
		}
	case "update":
		// Atualizar agora: prepara a versão nova e religa (o pre-start aplica).
		if err := updateNow(ctx, l); err != nil {
			emitFatal(em, err)
		}
	default:
		usage()
	}
}

// run é o supervisor: fica até SIGTERM/Ctrl+C, o "stop" do painel ou uma
// atualização pronta (aí sai e o systemd religa pela versão nova).
func run(ctx context.Context, stop context.CancelFunc, l hostkit.Layout) error {
	if runtime.GOOS == "linux" && os.Geteuid() == 0 {
		return fmt.Errorf("o servidor não roda como root (use o serviço do systemd, que roda como %q)", hostkit.ServiceUser)
	}
	logTo(l, "salinha-host.log")
	sup := hostkit.NewSupervisor(l, version).WithUpdates(updateConfig(), stop)
	restart := make(chan struct{}, 1)
	closeControl, err := hostkit.ServeControl(l, sup, stop, restart)
	if err != nil {
		return err
	}
	defer closeControl()
	log.Printf("Salinha Servidor %s em %s", version, l.Root)
	err = sup.Run(ctx, restart)
	if errors.Is(err, context.Canceled) {
		return nil
	}
	return err
}

// updateNow: versão mais nova no GitHub Releases? Prepara e religa o serviço.
func updateNow(ctx context.Context, l hostkit.Layout) error {
	cfg := updateConfig()
	if cfg.PublicKeyPEM == "" {
		return errors.New("esta versão do servidor não tem a chave para conferir atualizações")
	}
	sup := hostkit.NewSupervisor(l, version)
	if err := sup.TryUpdate(ctx, cfg, true); err != nil {
		return err
	}
	if _, err := os.Stat(l.NewApp()); err != nil {
		fmt.Println(`{"type":"step","step":"setup","state":"done","message":"O servidor já está na versão mais nova."}`)
		return nil
	}
	if err := hostkit.FixOwnership(l); err != nil {
		return err
	}
	if err := hostkit.StopSystem(l); err != nil {
		return err
	}
	_, err := hostkit.StartAndWait(l, 4*time.Minute)
	return err
}

// logTo manda o log para data/logs/<nome> (processos sem console).
func logTo(l hostkit.Layout, name string) {
	if err := os.MkdirAll(l.Logs(), 0o700); err != nil {
		return
	}
	if f, err := os.OpenFile(filepath.Join(l.Logs(), name), os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o600); err == nil {
		log.SetOutput(f)
	}
}

func layout(root string) (hostkit.Layout, error) {
	if root == "" {
		var err error
		if root, err = hostkit.DefaultRoot(); err != nil {
			return hostkit.Layout{}, err
		}
	}
	abs, err := filepath.Abs(root)
	if err != nil {
		return hostkit.Layout{}, err
	}
	return hostkit.Layout{Root: abs}, nil
}

func usage() {
	fmt.Fprintln(os.Stderr, "uso: salinha-host deploy|prepare-system|setup|finish-system|pre-start|run|status|stop|update [--root pasta]")
	os.Exit(2)
}

func emitFatal(em *hostkit.Emitter, err error) {
	em.Emit(hostkit.Event{Type: "error", Message: err.Error()})
	os.Exit(1)
}

func fatal(err error) {
	fmt.Fprintln(os.Stderr, "salinha-host:", err)
	os.Exit(1)
}
