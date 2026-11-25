package hoststats

import (
	"bufio"
	"bytes"
	"strconv"
	"strings"
)

// Memory: memória usada (%), disponível e swap usado (MB).
type Memory struct {
	UsedPercent, AvailableMB, SwapUsedMB float64
}

// meminfoValues: "Chave: valor kB" → valor (kB).
func meminfoValues(meminfo []byte) map[string]float64 {
	values := map[string]float64{}
	scanner := bufio.NewScanner(bytes.NewReader(meminfo))
	for scanner.Scan() {
		key, rest, ok := strings.Cut(scanner.Text(), ":")
		if !ok {
			continue
		}
		if v, err := strconv.ParseFloat(strings.Fields(rest + " 0")[0], 64); err == nil {
			values[key] = v
		}
	}
	return values
}

// parseMemUsed: 100 × (total − disponível) / total.
func parseMemUsed(meminfo []byte) (float64, error) {
	m, err := parseMemory(meminfo)
	return m.UsedPercent, err
}

func parseMemory(meminfo []byte) (Memory, error) {
	values := meminfoValues(meminfo)
	total, available := values["MemTotal"], values["MemAvailable"]
	if total <= 0 {
		return Memory{}, errFormat
	}
	return Memory{
		UsedPercent: (total - available) * 100 / total,
		AvailableMB: available / 1024,
		SwapUsedMB:  max(values["SwapTotal"]-values["SwapFree"], 0) / 1024,
	}, nil
}
