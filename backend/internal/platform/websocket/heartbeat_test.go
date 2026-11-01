package websocket

import (
	"context"
	"encoding/json"
	"testing"
)

// O app manda "ping" a cada tanto e conta a conexão como morta se não vier
// "pong" (troca de rede deixa o WS meio aberto sem ninguém perceber).
func TestDispatchPingAnswersPong(t *testing.T) {
	c := newDispatchClient(nil)
	c.send = make(chan []byte, 1)

	c.dispatch(context.Background(), event("ping", `null`))

	select {
	case got := <-c.send:
		var ev inboundEvent
		if err := json.Unmarshal(got, &ev); err != nil || ev.Type != "pong" {
			t.Fatalf("resposta = %s, want pong", got)
		}
	default:
		t.Fatal("ping sem pong")
	}
}

// Fila cheia (cliente lento): o pong é descartado, sem travar a leitura.
func TestDispatchPingWithFullQueueDoesNotBlock(t *testing.T) {
	c := newDispatchClient(nil)
	c.send = make(chan []byte, 1)
	c.send <- []byte("ocupado")

	c.dispatch(context.Background(), event("ping", `null`))

	if len(c.send) != 1 {
		t.Fatalf("fila = %d, want 1", len(c.send))
	}
}
