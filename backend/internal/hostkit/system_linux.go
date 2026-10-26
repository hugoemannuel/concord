//go:build linux

package hostkit

import (
	"errors"
	"fmt"
	"os"
	"os/exec"
	"os/user"
	"path/filepath"
	"strconv"
	"syscall"
	"time"
)

// Parte da instalação que precisa de root (o deploy roda como root pelo SSH):
// o Postgres não roda como root, então tudo do servidor roda como o usuário
// "salinha", e o systemd liga e religa o supervisor.

const unitName = "salinha-server.service"
const unitPath = "/etc/systemd/system/" + unitName

func requireRoot() error {
	if os.Geteuid() != 0 {
		return errors.New("rode como root (o instalador usa o usuário root da VPS)")
	}
	return nil
}

// PrepareSystem (root, antes do setup): usuário do serviço, pasta dele e as
// ferramentas do Maestro. Devolve um aviso quando algo opcional não deu.
func PrepareSystem(l Layout) (string, error) {
	if err := requireRoot(); err != nil {
		return "", err
	}
	if _, err := user.Lookup(ServiceUser); err != nil {
		out, err := exec.Command("useradd", "--system", "--home-dir", l.Root, "--no-create-home",
			"--shell", "/usr/sbin/nologin", ServiceUser).CombinedOutput()
		if err != nil {
			return "", fmt.Errorf("criar o usuário %s: %w: %s", ServiceUser, err, tail(out))
		}
	}
	if err := os.MkdirAll(l.Data(), 0o700); err != nil {
		return "", err
	}
	// O serviço troca app/ e app.new/ sozinho na atualização: a pasta é dele.
	if err := chownTree(l.Root); err != nil {
		return "", err
	}
	return installMusicTools(), nil
}

func serviceIDs() (int, int, error) {
	u, err := user.Lookup(ServiceUser)
	if err != nil {
		return 0, 0, err
	}
	uid, _ := strconv.Atoi(u.Uid)
	gid, _ := strconv.Atoi(u.Gid)
	return uid, gid, nil
}

// FixOwnership: o que root gravou na pasta (atualização pedida pelo SSH) volta
// a ser do usuário do serviço, senão o pre-start (como "salinha") não lê.
func FixOwnership(l Layout) error {
	if os.Geteuid() != 0 {
		return nil
	}
	return chownTree(l.Root)
}

func chownTree(root string) error {
	uid, gid, err := serviceIDs()
	if err != nil {
		return err
	}
	return filepath.Walk(root, func(path string, _ os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		return os.Lchown(path, uid, gid)
	})
}

// installMusicTools: ffmpeg e yt-dlp para o Maestro (bot de música), como o
// scripts/deploy-vps.sh. Sem eles o servidor funciona e o Maestro responde
// "fora do ar". Devolve um aviso quando não deu.
func installMusicTools() string {
	if _, err := exec.LookPath("ffmpeg"); err != nil {
		if _, err := exec.LookPath("apt-get"); err != nil {
			return "Sem apt-get: instale o ffmpeg na VPS para o bot de música funcionar."
		}
		install := func() ([]byte, error) {
			cmd := exec.Command("apt-get", "install", "-y", "-q", "ffmpeg")
			cmd.Env = append(os.Environ(), "DEBIAN_FRONTEND=noninteractive")
			return cmd.CombinedOutput()
		}
		if _, err := install(); err != nil {
			_ = exec.Command("apt-get", "update", "-q").Run()
			if out, err := install(); err != nil {
				return "Não deu para instalar o ffmpeg (bot de música): " + tail(out)
			}
		}
	}
	if _, err := exec.LookPath("yt-dlp"); err != nil {
		out, err := exec.Command("sh", "-c",
			"curl -fsSL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && chmod a+rx /usr/local/bin/yt-dlp").CombinedOutput()
		if err != nil {
			return "Não deu para baixar o yt-dlp (bot de música): " + tail(out)
		}
	}
	return ""
}

// unitText: o supervisor como serviço do systemd, como o concord-server da VPS
// oficial (deploy/concord-server.service.d): religa sempre (inclusive depois
// de preparar uma atualização) e só ganha a permissão de abrir as portas
// 80/443 (Caddy), sem ser root.
func unitText(l Layout) string {
	bin := l.Bin("salinha-host")
	return fmt.Sprintf(`[Unit]
Description=Salinha Servidor (Postgres, LiveKit, backend e Caddy)
Wants=network-online.target
After=network-online.target

[Service]
User=%[1]s
Group=%[1]s
WorkingDirectory=%[2]s
ExecStartPre=%[3]s pre-start --root %[4]s
ExecStart=%[3]s run --root %[4]s
Restart=always
RestartSec=3
StartLimitIntervalSec=0
KillSignal=SIGTERM
TimeoutStopSec=90
AmbientCapabilities=CAP_NET_BIND_SERVICE
CapabilityBoundingSet=CAP_NET_BIND_SERVICE
NoNewPrivileges=true
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
`, ServiceUser, l.Data(), bin, l.Root)
}

func hasSystemd() bool {
	if _, err := exec.LookPath("systemctl"); err != nil {
		return false
	}
	_, err := os.Stat("/run/systemd/system")
	return err == nil
}

// FinishSystem (root, depois do setup): firewall, serviço do systemd e liga.
// Sem systemd (contêiner de teste), sobe o supervisor como o usuário do serviço.
func FinishSystem(l Layout) (warning string, err error) {
	if err := requireRoot(); err != nil {
		return "", err
	}
	if err := chownTree(l.Root); err != nil {
		return "", err
	}
	cfg, err := ReadHostConfig(l.HostFile())
	if err != nil {
		return "", fmt.Errorf("servidor não configurado: %w", err)
	}
	warning = OpenFirewall(cfg.Ports)
	if !hasSystemd() {
		return warning, startAsServiceUser(l)
	}
	if err := os.WriteFile(unitPath, []byte(unitText(l)), 0o644); err != nil {
		return warning, err
	}
	for _, args := range [][]string{{"daemon-reload"}, {"enable", unitName}, {"restart", unitName}} {
		if out, err := exec.Command("systemctl", args...).CombinedOutput(); err != nil {
			return warning, fmt.Errorf("systemctl %v: %w: %s", args, err, tail(out))
		}
	}
	return warning, nil
}

// startAsServiceUser: sem systemd, o supervisor em segundo plano como "salinha".
func startAsServiceUser(l Layout) error {
	uid, gid, err := serviceIDs()
	if err != nil {
		return err
	}
	pre := exec.Command(l.Bin("salinha-host"), "pre-start", "--root", l.Root)
	pre.SysProcAttr = &syscall.SysProcAttr{Credential: &syscall.Credential{Uid: uint32(uid), Gid: uint32(gid)}}
	if out, err := pre.CombinedOutput(); err != nil {
		return fmt.Errorf("pre-start: %w: %s", err, tail(out))
	}
	cmd := exec.Command(l.Bin("salinha-host"), "run", "--root", l.Root)
	cmd.Dir = l.Data()
	cmd.Env = append(os.Environ(), "HOME="+l.Root)
	cmd.SysProcAttr = &syscall.SysProcAttr{
		Setsid:     true,
		Credential: &syscall.Credential{Uid: uint32(uid), Gid: uint32(gid)},
	}
	if err := cmd.Start(); err != nil {
		return err
	}
	return cmd.Process.Release()
}

// startService: com o serviço instalado, quem liga é o systemd; como root sem
// systemd, sobe como o usuário do serviço (nunca como root).
func startService(l Layout) (bool, error) {
	if !hasSystemd() {
		if os.Geteuid() == 0 {
			return true, startAsServiceUser(l)
		}
		return false, nil
	}
	if _, err := os.Stat(unitPath); err != nil {
		return false, nil
	}
	if os.Geteuid() != 0 {
		// O usuário do serviço não liga unidades do sistema; o systemd religa sozinho.
		return true, nil
	}
	out, err := exec.Command("systemctl", "start", unitName).CombinedOutput()
	if err != nil {
		return true, fmt.Errorf("systemctl start: %w: %s", err, tail(out))
	}
	return true, nil
}

// StopSystem (root): para o serviço (o "stop" do painel seria religado pelo systemd).
func StopSystem(l Layout) error {
	if hasSystemd() {
		if _, err := os.Stat(unitPath); err == nil {
			out, err := exec.Command("systemctl", "stop", unitName).CombinedOutput()
			if err != nil {
				return fmt.Errorf("systemctl stop: %w: %s", err, tail(out))
			}
			return nil
		}
	}
	return ControlStop(l, 90*time.Second)
}
