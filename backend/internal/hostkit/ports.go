package hostkit

import (
	"fmt"
	"net"
	"strconv"
)

// Ports são as portas do servidor local. Backend e mídia do LiveKit ficam
// abertas para a rede (é por elas que os amigos chegam); Postgres e a API do
// LiveKit só em 127.0.0.1.
type Ports struct {
	Backend    int `json:"backend"`
	Postgres   int `json:"postgres"`
	LiveKit    int `json:"livekit"`
	LiveKitTCP int `json:"livekitTcp"`
	LiveKitUDP int `json:"livekitUdp"`
}

// DefaultPorts: as mesmas do backend/.env.example.
var DefaultPorts = Ports{Backend: 8080, Postgres: 5432, LiveKit: 7880, LiveKitTCP: 7881, LiveKitUDP: 7882}

// portSearch: quantas portas seguintes testar quando a padrão está ocupada.
const portSearch = 50

// PickPorts troca cada porta ocupada pela próxima livre (sem repetir). free
// diz se dá para escutar na porta (trocável nos testes).
func PickPorts(want Ports, free func(port int, udp bool) bool) (Ports, error) {
	used := map[int]bool{}
	pick := func(start int, udp bool) (int, error) {
		for p := start; p < start+portSearch && p <= 65535; p++ {
			if used[p] || !free(p, udp) {
				continue
			}
			used[p] = true
			return p, nil
		}
		return 0, fmt.Errorf("nenhuma porta livre entre %d e %d", start, start+portSearch-1)
	}
	var got Ports
	var err error
	if got.Backend, err = pick(want.Backend, false); err != nil {
		return got, err
	}
	if got.Postgres, err = pick(want.Postgres, false); err != nil {
		return got, err
	}
	if got.LiveKit, err = pick(want.LiveKit, false); err != nil {
		return got, err
	}
	if got.LiveKitTCP, err = pick(want.LiveKitTCP, false); err != nil {
		return got, err
	}
	if got.LiveKitUDP, err = pick(want.LiveKitUDP, true); err != nil {
		return got, err
	}
	return got, nil
}

// PortFree tenta escutar na porta em 127.0.0.1 e em todas as interfaces (TCP
// ou UDP). Só uma não basta: no Windows o 0.0.0.0 abre mesmo com outro
// programa (ex.: o Postgres do Docker) segurando o 127.0.0.1 da mesma porta.
func PortFree(port int, udp bool) bool {
	for _, host := range []string{"127.0.0.1", ""} {
		if !listenable(net.JoinHostPort(host, strconv.Itoa(port)), udp) {
			return false
		}
	}
	return true
}

func listenable(addr string, udp bool) bool {
	if udp {
		conn, err := net.ListenPacket("udp", addr)
		if err != nil {
			return false
		}
		_ = conn.Close()
		return true
	}
	ln, err := net.Listen("tcp", addr)
	if err != nil {
		return false
	}
	_ = ln.Close()
	return true
}
