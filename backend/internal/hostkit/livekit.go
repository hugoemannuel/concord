package hostkit

import (
	"fmt"
	"strings"
)

// RenderLiveKitConfig gera o data/livekit.yaml: o mesmo LIVEKIT_CONFIG do
// backend/docker-compose.yml (o teste confere que as chaves batem), mais as
// chaves de API, que no compose vêm do LIVEKIT_KEYS.
func RenderLiveKitConfig(p Ports, apiKey, apiSecret, nodeIP string) string {
	lines := []string{
		"# Gerado pelo Salinha Servidor. Igual ao LIVEKIT_CONFIG do docker-compose.yml.",
		fmt.Sprintf("port: %d", p.LiveKit),
		"# API/sinalização só local (o backend faz proxy de /rtc); a mídia",
		"# (rtc.tcp_port/udp_port) continua aberta.",
		`bind_addresses: ["127.0.0.1"]`,
		"log_level: info",
		"keys:",
		fmt.Sprintf("  %s: %s", apiKey, apiSecret),
		"rtc:",
		fmt.Sprintf("  tcp_port: %d", p.LiveKitTCP),
		fmt.Sprintf("  udp_port: %d", p.LiveKitUDP),
		"  use_external_ip: false",
		fmt.Sprintf("  node_ip: %q", nodeIP),
		"  advertise_internal_ip: true",
		"  enable_loopback_candidate: true",
		"audio:",
		"  active_level: 35",
		"  min_percentile: 40",
		"  update_interval: 150",
		"  smooth_intervals: 1",
		"room:",
		"  empty_timeout: 300",
		"  max_participants: 25",
		"",
	}
	return strings.Join(lines, "\n")
}
