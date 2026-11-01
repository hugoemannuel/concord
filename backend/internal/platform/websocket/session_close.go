package websocket

import "github.com/coder/websocket"

// CloseSessionRevoked (4001) avisa o app que a sessão acabou (saiu de todos os
// dispositivos, trocou a senha ou excluiu a conta): o próximo connect com o
// token antigo é recusado e o app volta para o login.
const (
	CloseSessionRevoked      websocket.StatusCode = 4001
	closeSessionRevokedCause                      = "sessão encerrada"
)

// DisconnectUser fecha todas as conexões abertas de userID (docs/adr/0039).
func (h *Hub) DisconnectUser(userID string) {
	h.mu.RLock()
	var conns []*websocket.Conn
	for client := range h.clients {
		if client.userID == userID && client.conn != nil {
			conns = append(conns, client.conn)
		}
	}
	h.mu.RUnlock()
	for _, conn := range conns {
		// Close espera o "ok" do app (até 5 s): fora do caminho de quem chamou.
		go conn.Close(CloseSessionRevoked, closeSessionRevokedCause)
	}
}
