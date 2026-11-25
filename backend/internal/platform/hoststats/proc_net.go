package hoststats

import (
	"bufio"
	"bytes"
	"strconv"
	"strings"
)

// netCounters: contadores acumulados de uma interface (/proc/net/dev).
type netCounters struct {
	rxBytes, rxPackets, txBytes, txPackets uint64
	errors, drops                          uint64
}

// Interfaces que não são a saída da máquina: loopback e as do Docker.
var virtualPrefixes = []string{"lo", "docker", "br-", "veth"}

func isVirtual(name string) bool {
	for _, p := range virtualPrefixes {
		if strings.HasPrefix(name, p) {
			return true
		}
	}
	return false
}

// parseNetDev: as interfaces reais. Colunas depois do ":": rx bytes packets
// errs drop fifo frame compressed multicast, tx bytes packets errs drop ...
func parseNetDev(data []byte) map[string]netCounters {
	out := map[string]netCounters{}
	scanner := bufio.NewScanner(bytes.NewReader(data))
	for scanner.Scan() {
		name, rest, ok := strings.Cut(scanner.Text(), ":")
		name = strings.TrimSpace(name)
		if !ok || isVirtual(name) {
			continue
		}
		if c, ok := netLine(strings.Fields(rest)); ok {
			out[name] = c
		}
	}
	return out
}

func netLine(f []string) (netCounters, bool) {
	if len(f) < 12 {
		return netCounters{}, false
	}
	v := make([]uint64, 12)
	for i := range v {
		n, err := strconv.ParseUint(f[i], 10, 64)
		if err != nil {
			return netCounters{}, false
		}
		v[i] = n
	}
	return netCounters{rxBytes: v[0], rxPackets: v[1], txBytes: v[8], txPackets: v[9],
		errors: v[2] + v[10], drops: v[3] + v[11]}, true
}

// defaultRouteInterface: a interface da rota padrão (destino e máscara 0).
func defaultRouteInterface(route []byte) string {
	scanner := bufio.NewScanner(bytes.NewReader(route))
	for scanner.Scan() {
		f := strings.Fields(scanner.Text())
		if len(f) >= 8 && f[1] == "00000000" && f[7] == "00000000" {
			return f[0]
		}
	}
	return ""
}

// pickInterface: a da rota padrão; sem ela, a de mais tráfego.
func pickInterface(devs map[string]netCounters, preferred string) (string, netCounters) {
	if c, ok := devs[preferred]; ok {
		return preferred, c
	}
	var best string
	for name, c := range devs {
		if b := devs[best]; best == "" || c.rxBytes+c.txBytes > b.rxBytes+b.txBytes {
			best = name
		}
	}
	return best, devs[best]
}

// UDP: erros do UDP do kernel (/proc/net/snmp), acumulados ou no intervalo.
type UDP struct {
	InErrors, RcvbufErrors, SndbufErrors uint64
}

// parseUDP: a linha de nomes "Udp: ..." e a de valores logo depois.
func parseUDP(snmp []byte) (UDP, error) {
	var header []string
	scanner := bufio.NewScanner(bytes.NewReader(snmp))
	for scanner.Scan() {
		f := strings.Fields(scanner.Text())
		if len(f) == 0 || f[0] != "Udp:" {
			continue
		}
		if header == nil {
			header = f
			continue
		}
		return udpValues(header, f)
	}
	return UDP{}, errFormat
}

func udpValues(header, values []string) (UDP, error) {
	got := map[string]uint64{}
	for i := 1; i < min(len(header), len(values)); i++ {
		if v, err := strconv.ParseUint(values[i], 10, 64); err == nil {
			got[header[i]] = v
		}
	}
	return UDP{InErrors: got["InErrors"], RcvbufErrors: got["RcvbufErrors"], SndbufErrors: got["SndbufErrors"]}, nil
}
