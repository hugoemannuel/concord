package hostkit

import (
	"errors"
	"fmt"
	"net"
	"os/exec"
	"regexp"
	"strconv"
	"strings"
)

// O servidor da turma numa VPS, como o oficial (docs/HOSPEDAGEM.md §7): IP
// público, mídia do LiveKit direto nas portas dele (sem túnel nem P2P) e o
// Caddy na frente com HTTPS automático em <ip-com-hífens>.sslip.io ou num
// domínio próprio apontado para a VPS.

// ServiceUser é o usuário do sistema que roda o servidor na VPS (o Postgres
// não roda como root).
const ServiceUser = "salinha"

// VPSOptions do "salinha-host setup --public-ip … [--domain …]".
type VPSOptions struct {
	PublicIP string
	// Domain: domínio próprio (opcional); vazio = <ip-com-hífens>.sslip.io.
	Domain string
	// TLSInternal: certificado da CA interna do Caddy (só testes, sem internet).
	TLSInternal bool
}

// SslipHost: 74.0.5.252 → 74-0-5-252.sslip.io (aponta para o próprio IP).
func SslipHost(ip net.IP) string {
	return strings.ReplaceAll(ip.To4().String(), ".", "-") + ".sslip.io"
}

var domainPattern = regexp.MustCompile(`^(?i)[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$`)

// vpsNetwork monta a rede da VPS a partir do IP público e do domínio.
func vpsNetwork(opts VPSOptions) (Network, error) {
	ip := net.ParseIP(strings.TrimSpace(opts.PublicIP))
	if ip == nil || ip.To4() == nil {
		return Network{}, fmt.Errorf("IP público inválido: %q", opts.PublicIP)
	}
	if ip.IsPrivate() || ip.IsLoopback() || cgnatBlock.Contains(ip) {
		if !opts.TLSInternal {
			return Network{}, fmt.Errorf("%s não é um IP público: use o IP que a VPS recebeu", ip)
		}
	}
	host := SslipHost(ip)
	domain := strings.ToLower(strings.TrimSuffix(strings.TrimSpace(opts.Domain), "."))
	if domain != "" {
		if !domainPattern.MatchString(domain) {
			return Network{}, fmt.Errorf("domínio inválido: %q", opts.Domain)
		}
		host = domain
	}
	return Network{Mode: "vps", PublicURL: "https://" + host, NodeIP: ip.To4().String(), Domain: domain}, nil
}

// cgnatBlock é o 100.64.0.0/10 (RFC 6598): não é IP público de verdade.
var cgnatBlock = &net.IPNet{IP: net.IPv4(100, 64, 0, 0), Mask: net.CIDRMask(10, 32)}

// publicHost: o nome que vai no certificado (sem https://).
func publicHost(n Network) string {
	return strings.TrimPrefix(n.PublicURL, "https://")
}

// RenderCaddyfile: o mesmo desenho do deploy/Caddyfile da VPS oficial.
func RenderCaddyfile(l Layout, n Network, p Ports, tlsInternal bool) string {
	tls := ""
	if tlsInternal {
		tls = "\n\ttls internal"
	}
	return fmt.Sprintf(`# Gerado pelo Salinha Servidor. Mesmo desenho do deploy/Caddyfile da VPS oficial.
{
	admin 127.0.0.1:%[1]d
}

%[2]s {%[3]s
	# Sinalização do LiveKit direto nele: reiniciar o backend não corta a chamada.
	handle /rtc* {
		reverse_proxy 127.0.0.1:%[4]d
	}

	# Instaladores do app (os amigos se atualizam daqui) direto do disco.
	handle /updates/* {
		uri strip_prefix /updates
		root * %[5]q
		file_server
	}

	# Backend: API e WebSocket do chat.
	handle {
		reverse_proxy 127.0.0.1:%[6]d {
			lb_try_duration 15s
			lb_try_interval 100ms
			transport http {
				keepalive off
			}
		}
	}
}
`, caddyAdminPort, publicHost(n), tls, p.LiveKit, l.Updates(), p.Backend)
}

// caddyAdminPort: API de administração do Caddy (só local; o supervisor
// confere por ela que ele está no ar).
const caddyAdminPort = 2019

// ApplyNetwork grava a rede no host.json, no .env, no livekit.yaml e no
// Caddyfile. O supervisor reinicia o que precisa (ControlRestart).
func ApplyNetwork(l Layout, n Network, tlsInternal bool) error {
	cfg, err := ReadHostConfig(l.HostFile())
	if err != nil {
		return err
	}
	cfg.Network = n
	cfg.TLSInternal = tlsInternal
	if err := SetEnvValues(l.EnvFile(), map[string]string{
		// Atrás do Caddy: o backend só escuta local e confia no X-Forwarded-For dele.
		"HOST":            "127.0.0.1",
		"PUBLIC_URL":      n.PublicURL,
		"API_PUBLIC_URL":  n.PublicURL,
		"APP_URL":         n.PublicURL,
		"LIVEKIT_NODE_IP": n.NodeIP,
	}); err != nil {
		return err
	}
	if err := writeLiveKitConfig(l, cfg.Ports, n.NodeIP); err != nil {
		return err
	}
	if err := writeFileAtomic(l.CaddyFile(), []byte(RenderCaddyfile(l, n, cfg.Ports, tlsInternal)), 0o600); err != nil {
		return err
	}
	return WriteHostConfig(l.HostFile(), cfg)
}

func writeLiveKitConfig(l Layout, p Ports, nodeIP string) error {
	key := EnvValue(l.EnvFile(), "LIVEKIT_API_KEY")
	secret := EnvValue(l.EnvFile(), "LIVEKIT_API_SECRET")
	if key == "" || secret == "" {
		return errors.New("chaves do LiveKit ausentes no .env")
	}
	return writeFileAtomic(l.LiveKitFile(), []byte(RenderLiveKitConfig(p, key, secret, nodeIP)), 0o600)
}

// publicPorts: o que precisa estar aberto para fora na VPS.
func publicPorts(p Ports) []string {
	return []string{"80/tcp", "443/tcp", strconv.Itoa(p.LiveKitTCP) + "/tcp", strconv.Itoa(p.LiveKitUDP) + "/udp"}
}

// OpenFirewall libera as portas no firewall da VPS (ufw ou firewalld, se
// estiverem ligados). Devolve um aviso quando não deu: o firewall do painel do
// provedor (security group) a pessoa abre por lá.
func OpenFirewall(p Ports) string {
	ports := publicPorts(p)
	if out, err := exec.Command("ufw", "status").CombinedOutput(); err == nil && strings.Contains(string(out), "Status: active") {
		for _, port := range ports {
			if out, err := exec.Command("ufw", "allow", port).CombinedOutput(); err != nil {
				return fmt.Sprintf("não deu para liberar %s no ufw: %s", port, tail(out))
			}
		}
		return ""
	}
	if err := exec.Command("firewall-cmd", "--state").Run(); err == nil {
		for _, port := range ports {
			if out, err := exec.Command("firewall-cmd", "--permanent", "--add-port="+port).CombinedOutput(); err != nil {
				return fmt.Sprintf("não deu para liberar %s no firewalld: %s", port, tail(out))
			}
		}
		_ = exec.Command("firewall-cmd", "--reload").Run()
	}
	return ""
}

func baseURL(host string, port int) string {
	return "http://" + net.JoinHostPort(host, strconv.Itoa(port))
}
