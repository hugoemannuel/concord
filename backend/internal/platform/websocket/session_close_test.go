package websocket

import (
	"errors"
	"testing"
	"time"

	"github.com/coder/websocket"
)

func TestDisconnectUserFechaSoAsConexoesDaPessoaComSessaoEncerrada(t *testing.T) {
	hub := NewHub()
	ana := readUntilClose(connectClient(t, hub, "ana"))
	bia := readUntilClose(connectClient(t, hub, "bia"))

	hub.DisconnectUser("ana")

	select {
	case err := <-ana:
		var ce websocket.CloseError
		if !errors.As(err, &ce) || ce.Code != CloseSessionRevoked {
			t.Fatalf("fechamento = %v, quer %d", err, CloseSessionRevoked)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("a conexão da ana não fechou")
	}
	select {
	case err := <-bia:
		t.Fatalf("a conexão da bia fechou: %v", err)
	case <-time.After(100 * time.Millisecond):
	}
}
