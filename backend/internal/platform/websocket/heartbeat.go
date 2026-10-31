package websocket

// Batimento do app: o navegador não expõe o ping/pong do protocolo, então o
// app manda {"type":"ping"} a cada tanto e conta a conexão como morta se o
// "pong" não voltar (troca de rede deixa o WS meio aberto sem erro nenhum).
// Ver docs/adr/0037-batimento-do-websocket.md.

var pongEvent = writeEvent("pong", nil)

// pong responde o ping do app. Fila cheia: descarta, como os outros eventos;
// o app tenta de novo no próximo batimento.
func (c *Client) pong() {
	select {
	case c.send <- pongEvent:
	default:
	}
}
