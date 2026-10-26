package hostkit

import (
	"net"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
)

func TestPickPortsSkipsBusyAndRepeated(t *testing.T) {
	busy := map[int]bool{8080: true, 8081: true, 5432: true}
	got, err := PickPorts(DefaultPorts, func(p int, udp bool) bool { return !busy[p] })
	if err != nil {
		t.Fatal(err)
	}
	want := Ports{Backend: 8082, Postgres: 5433, LiveKit: 7880, LiveKitTCP: 7881, LiveKitUDP: 7882}
	if got != want {
		t.Fatalf("got %+v want %+v", got, want)
	}

	// Duas portas que começariam no mesmo número não ficam iguais.
	same := Ports{Backend: 9000, Postgres: 9000, LiveKit: 9000, LiveKitTCP: 9000, LiveKitUDP: 9000}
	got, err = PickPorts(same, func(int, bool) bool { return true })
	if err != nil {
		t.Fatal(err)
	}
	seen := map[int]bool{}
	for _, p := range []int{got.Backend, got.Postgres, got.LiveKit, got.LiveKitTCP, got.LiveKitUDP} {
		if seen[p] {
			t.Fatalf("porta repetida em %+v", got)
		}
		seen[p] = true
	}
}

// Porta presa só no 127.0.0.1 (como o Postgres do Docker) conta como ocupada.
func TestPortFreeSeesLoopbackOnlyListener(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer ln.Close()
	if PortFree(ln.Addr().(*net.TCPAddr).Port, false) {
		t.Fatal("porta presa no 127.0.0.1 não pode contar como livre")
	}
}

func TestPickPortsFailsWhenNothingFree(t *testing.T) {
	if _, err := PickPorts(DefaultPorts, func(int, bool) bool { return false }); err == nil {
		t.Fatal("esperava erro")
	}
}

func TestRenderEnvHasWhatTheBackendReads(t *testing.T) {
	env := RenderEnv(DefaultPorts, Secrets{JWT: "j", LiveKit: "l", DBPassword: "pw"}, Network{PublicURL: "http://1.2.3.4:8080", NodeIP: "1.2.3.4"})
	for _, want := range []string{
		"PORT=8080",
		"DATABASE_URL=postgres://concord:pw@127.0.0.1:5432/concord?sslmode=disable",
		"JWT_SECRET=j",
		"LIVEKIT_API_SECRET=l",
		"LIVEKIT_UDP_PORT=7882",
		"LIVEKIT_NODE_IP=1.2.3.4",
		"PUBLIC_URL=http://1.2.3.4:8080",
		"EMAIL_VERIFICATION=off",
	} {
		if !strings.Contains(env, want+"\n") {
			t.Errorf("faltou %q no .env", want)
		}
	}
}

func TestSetEnvValuesKeepsTheRest(t *testing.T) {
	path := filepath.Join(t.TempDir(), ".env")
	if err := os.WriteFile(path, []byte("# comentário\nPORT=8080\nPUBLIC_URL=\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := SetEnvValues(path, map[string]string{"PUBLIC_URL": "http://x:1", "LIVEKIT_NODE_IP": "9.9.9.9"}); err != nil {
		t.Fatal(err)
	}
	data, _ := os.ReadFile(path)
	want := "# comentário\nPORT=8080\nPUBLIC_URL=http://x:1\nLIVEKIT_NODE_IP=9.9.9.9\n"
	if string(data) != want {
		t.Fatalf("got %q want %q", data, want)
	}
	if EnvValue(path, "PUBLIC_URL") != "http://x:1" || EnvValue(path, "NADA") != "" {
		t.Fatal("EnvValue")
	}
}

func TestHostConfigRoundTrip(t *testing.T) {
	path := filepath.Join(t.TempDir(), "host.json")
	cfg := HostConfig{Ports: DefaultPorts, Network: Network{Mode: "lan", PublicURL: "http://192.168.0.2:8080"}, AutoUpdate: true}
	if err := WriteHostConfig(path, cfg); err != nil {
		t.Fatal(err)
	}
	got, err := ReadHostConfig(path)
	if err != nil || got != cfg {
		t.Fatalf("got %+v err %v", got, err)
	}
}

// yamlKeys devolve as chaves (com o caminho dos pais) de um YAML simples,
// ignorando comentários e valores.
func yamlKeys(text string) []string {
	key := regexp.MustCompile(`^(\s*)([a-z_]+):`)
	var keys, stack []string
	for _, line := range strings.Split(text, "\n") {
		if strings.HasPrefix(strings.TrimSpace(line), "#") {
			continue
		}
		m := key.FindStringSubmatch(line)
		if m == nil {
			continue
		}
		depth := len(m[1]) / 2
		if depth > len(stack) {
			depth = len(stack)
		}
		stack = append(stack[:depth], m[2])
		keys = append(keys, strings.Join(stack, "."))
	}
	return keys
}

// O livekit.yaml do host e o LIVEKIT_CONFIG do compose não podem divergir:
// mudou um, muda o outro.
func TestLiveKitConfigMatchesCompose(t *testing.T) {
	compose, err := os.ReadFile(filepath.Join("..", "..", "docker-compose.yml"))
	if err != nil {
		t.Fatal(err)
	}
	text := strings.ReplaceAll(string(compose), "\r\n", "\n")
	start := strings.Index(text, "LIVEKIT_CONFIG: |\n")
	if start < 0 {
		t.Fatal("LIVEKIT_CONFIG não encontrado no docker-compose.yml")
	}
	var block []string
	for _, line := range strings.Split(text[start+len("LIVEKIT_CONFIG: |\n"):], "\n") {
		if strings.TrimSpace(line) == "" {
			break
		}
		if !strings.HasPrefix(line, "        ") {
			break
		}
		block = append(block, strings.TrimPrefix(line, "        "))
	}
	want := yamlKeys(strings.Join(block, "\n"))

	var got []string
	for _, k := range yamlKeys(RenderLiveKitConfig(DefaultPorts, "k", "s", "")) {
		// keys vem do LIVEKIT_KEYS no compose, não do LIVEKIT_CONFIG.
		if k == "keys" || strings.HasPrefix(k, "keys.") {
			continue
		}
		got = append(got, k)
	}
	if strings.Join(got, ",") != strings.Join(want, ",") {
		t.Fatalf("livekit.yaml diverge do compose\n host:    %v\n compose: %v", got, want)
	}
}
