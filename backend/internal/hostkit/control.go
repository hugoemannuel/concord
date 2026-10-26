package hostkit

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"time"
)

// Painel de controle do supervisor: HTTP só em 127.0.0.1, porta aleatória e
// token, gravados em data/control.json (só o dono lê). O salinha-host
// stop/status/network e o app (Configurações → Servidor) falam com ele.

// ErrAlreadyRunning: outro supervisor já está no ar nesta pasta.
var ErrAlreadyRunning = errors.New("o servidor já está rodando")

type controlFile struct {
	Port  int    `json:"port"`
	Token string `json:"token"`
	PID   int    `json:"pid"`
}

func controlPath(l Layout) string { return filepath.Join(l.Data(), "control.json") }

// ServeControl abre o painel. stop encerra o supervisor e restart reinicia
// LiveKit e backend. O painel fica de pé (status "stopping") até quem chamou
// usar o close devolvido, depois que tudo parou: o "salinha-host stop" só
// volta com os processos fora.
func ServeControl(l Layout, sup *Supervisor, stop func(), restart chan<- struct{}) (func(), error) {
	// Um supervisor por pasta: a trava vale até o processo sair (ou morrer).
	if err := os.MkdirAll(l.Data(), 0o700); err != nil {
		return nil, err
	}
	lock, err := lockFile(filepath.Join(l.Data(), "supervisor.lock"))
	if err != nil {
		return nil, err
	}
	token, err := randomHex(24)
	if err != nil {
		_ = lock.Close()
		return nil, err
	}
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		_ = lock.Close()
		return nil, err
	}
	file := controlFile{Port: ln.Addr().(*net.TCPAddr).Port, Token: token, PID: os.Getpid()}
	data, _ := json.Marshal(file)
	if err := writeFileAtomic(controlPath(l), data, 0o600); err != nil {
		_ = ln.Close()
		_ = lock.Close()
		return nil, err
	}

	mux := http.NewServeMux()
	authed := func(h http.HandlerFunc) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			got := r.Header.Get("Authorization")
			if subtle.ConstantTimeCompare([]byte(got), []byte("Bearer "+token)) != 1 {
				http.Error(w, "forbidden", http.StatusForbidden)
				return
			}
			h(w, r)
		}
	}
	mux.HandleFunc("GET /status", authed(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(sup.Status())
	}))
	mux.HandleFunc("POST /stop", authed(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusAccepted)
		go stop()
	}))
	mux.HandleFunc("POST /restart", authed(func(w http.ResponseWriter, _ *http.Request) {
		select {
		case restart <- struct{}{}:
		default:
		}
		w.WriteHeader(http.StatusAccepted)
	}))

	srv := &http.Server{Handler: mux, ReadHeaderTimeout: 5 * time.Second}
	go func() { _ = srv.Serve(ln) }()
	return func() {
		_ = os.Remove(controlPath(l))
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		_ = srv.Shutdown(shutdownCtx)
		_ = lock.Close()
	}, nil
}

func controlCall(l Layout, method, path string) (*http.Response, error) {
	data, err := os.ReadFile(controlPath(l))
	if err != nil {
		return nil, err
	}
	var file controlFile
	if err := json.Unmarshal(data, &file); err != nil {
		return nil, err
	}
	req, err := http.NewRequest(method, fmt.Sprintf("http://127.0.0.1:%d%s", file.Port, path), nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+file.Token)
	client := &http.Client{Timeout: 3 * time.Second}
	return client.Do(req)
}

// ControlStatus pergunta ao supervisor no ar (erro = não está rodando).
func ControlStatus(l Layout) (Status, error) {
	var st Status
	res, err := controlCall(l, http.MethodGet, "/status")
	if err != nil {
		return st, err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return st, fmt.Errorf("painel respondeu %d", res.StatusCode)
	}
	err = json.NewDecoder(res.Body).Decode(&st)
	return st, err
}

func controlPost(l Layout, path string) error {
	res, err := controlCall(l, http.MethodPost, path)
	if err != nil {
		return err
	}
	_, _ = io.Copy(io.Discard, res.Body)
	_ = res.Body.Close()
	if res.StatusCode != http.StatusAccepted {
		return fmt.Errorf("painel respondeu %d", res.StatusCode)
	}
	return nil
}

// ControlStop pede para o supervisor desligar tudo e espera ele sair.
func ControlStop(l Layout, wait time.Duration) error {
	if err := controlPost(l, "/stop"); err != nil {
		return err
	}
	deadline := time.Now().Add(wait)
	for time.Now().Before(deadline) {
		if _, err := ControlStatus(l); err != nil {
			return nil
		}
		time.Sleep(300 * time.Millisecond)
	}
	return errors.New("o servidor não parou a tempo")
}

// ControlRestart reinicia LiveKit e backend (depois de mudar a rede).
func ControlRestart(l Layout) error { return controlPost(l, "/restart") }
